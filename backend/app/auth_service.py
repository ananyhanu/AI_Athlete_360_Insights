"""Coach registration, verification challenges, delivery adapters, and OAuth sign-in flows."""

from __future__ import annotations

import hashlib
import json
import secrets
import smtplib
from datetime import timedelta, timezone
from email.message import EmailMessage
from typing import Literal
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import Settings
from .models import AuthChallenge, User, utc_now
from .security import create_access_token, hash_password

# The stored challenge purpose determines the allowed verification flow for a hashed secret.
ChallengePurpose = Literal["email-verification", "mobile-otp", "oauth-state"]


def normalize_mobile_number(value: str) -> str:
    """Normalize and validate an E.164-style international mobile number."""
    # Remove common display separators before enforcing the explicit leading country code.
    normalized = value.strip().replace(" ", "").replace("-", "")
    if not normalized.startswith("+") or not normalized[1:].isdigit() or not 8 <= len(normalized[1:]) <= 15:
        raise ValueError("Enter a valid mobile number in international format, for example +919876543210.")
    return normalized


def register_coach(session: Session, settings: Settings, email: str, password: str, mobile_number: str) -> None:
    """Create or refresh an unverified coach registration, then send an email challenge."""
    require_email_delivery(settings)
    normalized_email = email.lower()
    normalized_mobile = normalize_mobile_number(mobile_number)
    user = session.scalar(select(User).where(User.email == normalized_email))

    if user and (user.email_verified or user.mobile_verified):
        # Keep the response neutral so this endpoint does not become an account-discovery oracle.
        return

    if not user:
        # New accounts start unverified and receive only the coach role required by this flow.
        user = User(
            email=normalized_email,
            mobile_number=normalized_mobile,
            password_hash=hash_password(password),
            roles_json=json.dumps(["coach"]),
        )
        session.add(user)
        session.flush()
    else:
        user.mobile_number = normalized_mobile
        user.password_hash = hash_password(password)
        user.roles_json = json.dumps(["coach"])

    token = issue_challenge(session, "email-verification", user, normalized_email, 60)
    session.commit()
    send_email_verification(settings, normalized_email, token)


def verify_email(session: Session, token: str) -> User:
    """Consume an email-verification challenge and mark its linked user as verified."""
    challenge = consume_challenge(session, "email-verification", token)
    if not challenge.user_id:
        raise ValueError("The verification link is invalid or has expired.")
    user = session.get(User, challenge.user_id)
    if not user:
        raise ValueError("The verification link is invalid or has expired.")
    user.email_verified = True
    session.commit()
    return user


def request_mobile_otp(session: Session, settings: Settings, email: str, mobile_number: str) -> None:
    """Issue and deliver a short-lived OTP only when email and mobile details match an account."""
    require_mobile_delivery(settings)
    normalized_email = email.lower()
    normalized_mobile = normalize_mobile_number(mobile_number)
    user = session.scalar(select(User).where(User.email == normalized_email))
    if not user or user.mobile_number != normalized_mobile:
        # Preserve account privacy by responding as though the request was accepted.
        return

    # Generate digits with the cryptographically secure secrets module rather than a predictable PRNG.
    otp = "".join(str(secrets.randbelow(10)) for _ in range(6))
    issue_challenge(session, "mobile-otp", user, otp, 10, target=normalized_mobile)
    session.commit()
    send_mobile_otp(settings, normalized_mobile, otp)


def verify_mobile_otp(session: Session, settings: Settings, email: str, otp: str) -> tuple[str, User]:
    """Consume a matching OTP, mark mobile verification, and issue a bearer token."""
    user = session.scalar(select(User).where(User.email == email.lower()))
    if not user:
        raise ValueError("The verification code is invalid or has expired.")
    challenge = consume_challenge(session, "mobile-otp", otp, target=user.mobile_number)
    if challenge.user_id != user.id:
        raise ValueError("The verification code is invalid or has expired.")
    user.mobile_verified = True
    session.commit()
    return create_access_token(user, settings), user


def oauth_authorization_url(session: Session, settings: Settings, provider: Literal["google", "government"]) -> str:
    """Create a provider authorization URL protected by a one-time server-stored OAuth state."""
    configuration = oauth_configuration(settings, provider)
    # The state value binds the callback to the provider and expires after ten minutes.
    state = issue_challenge(session, "oauth-state", None, secrets.token_urlsafe(32), 10, target=provider)
    session.commit()
    query = urlencode(
        {
            "client_id": configuration["client_id"],
            "redirect_uri": settings.oauth_callback_url(provider),
            "response_type": "code",
            "scope": configuration["scope"],
            "state": state,
        }
    )
    return f"{configuration['authorization_url']}?{query}"


def complete_oauth_callback(
    session: Session,
    settings: Settings,
    provider: Literal["google", "government"],
    code: str,
    state: str,
) -> tuple[str, User]:
    """Validate OAuth state, exchange the provider code, and return a token for a verified coach."""
    challenge = consume_challenge(session, "oauth-state", state, target=provider)
    if challenge.target != provider:
        raise ValueError("The sign-in request is invalid or has expired.")

    configuration = oauth_configuration(settings, provider)
    token_payload = post_form(
        configuration["token_url"],
        {
            "client_id": configuration["client_id"],
            "client_secret": configuration["client_secret"],
            "code": code,
            "grant_type": "authorization_code",
            "redirect_uri": settings.oauth_callback_url(provider),
        },
    )
    email = oauth_email(settings, provider, token_payload)
    user = session.scalar(select(User).where(User.email == email))
    if not user:
        # OAuth accounts use an unguessable unusable password because authentication stays with the provider.
        user = User(
            email=email,
            email_verified=True,
            mobile_number=None,
            mobile_verified=False,
            password_hash=hash_password(secrets.token_urlsafe(32)),
            roles_json=json.dumps(["coach"]),
        )
        session.add(user)
    else:
        user.email_verified = True
        user.is_active = True
    session.commit()
    return create_access_token(user, settings), user


def issue_challenge(
    session: Session,
    purpose: ChallengePurpose,
    user: User | None,
    secret: str,
    minutes: int,
    target: str | None = None,
) -> str:
    """Replace outstanding matching challenges with one hashed, expiring, single-use secret."""
    # Invalidate older challenges first so only the newest email, OTP, or state value remains usable.
    session.query(AuthChallenge).filter(
        AuthChallenge.purpose == purpose,
        AuthChallenge.target == target,
        AuthChallenge.user_id == (user.id if user else None),
        AuthChallenge.consumed_at.is_(None),
    ).update({"consumed_at": utc_now()}, synchronize_session=False)
    session.add(
        AuthChallenge(
            purpose=purpose,
            secret_hash=hash_secret(secret),
            target=target,
            user_id=user.id if user else None,
            expires_at=utc_now() + timedelta(minutes=minutes),
        )
    )
    return secret


def consume_challenge(
    session: Session,
    purpose: ChallengePurpose,
    secret: str,
    target: str | None = None,
) -> AuthChallenge:
    """Find, validate, and mark a challenge as consumed before its caller changes user state."""
    challenge = session.scalar(
        select(AuthChallenge)
        .where(
            AuthChallenge.purpose == purpose,
            AuthChallenge.secret_hash == hash_secret(secret),
            AuthChallenge.consumed_at.is_(None),
        )
        .order_by(AuthChallenge.created_at.desc())
    )
    # SQLite can return naive timestamps, so normalize them before comparison with aware UTC time.
    expires_at = (
        challenge.expires_at.replace(tzinfo=timezone.utc)
        if challenge and challenge.expires_at.tzinfo is None
        else challenge.expires_at if challenge else None
    )
    if not challenge or expires_at <= utc_now() or (target is not None and challenge.target != target):
        raise ValueError("The verification code or sign-in request is invalid or has expired.")
    challenge.consumed_at = utc_now()
    return challenge


def oauth_configuration(settings: Settings, provider: Literal["google", "government"]) -> dict[str, str]:
    """Resolve the complete OAuth configuration required by the selected provider."""
    if provider == "google":
        values = {
            "authorization_url": "https://accounts.google.com/o/oauth2/v2/auth",
            "client_id": settings.google_client_id,
            "client_secret": settings.google_client_secret,
            "scope": "openid email profile",
            "token_url": "https://oauth2.googleapis.com/token",
        }
    else:
        values = {
            "authorization_url": settings.government_sso_authorization_url,
            "client_id": settings.government_sso_client_id,
            "client_secret": settings.government_sso_client_secret,
            "scope": settings.government_sso_scope,
            "token_url": settings.government_sso_token_url,
        }
    if not all(values.values()):
        raise RuntimeError(f"{provider}_sso_not_configured")
    return values


def oauth_email(settings: Settings, provider: Literal["google", "government"], token_payload: dict[str, object]) -> str:
    """Fetch and validate the provider's explicitly verified email claim for the current token."""
    access_token = token_payload.get("access_token")
    if not isinstance(access_token, str) or not access_token:
        raise ValueError("The identity provider did not return an access token.")

    if provider == "google":
        profile_url = "https://openidconnect.googleapis.com/v1/userinfo"
    else:
        profile_url = settings.government_sso_userinfo_url
    if not profile_url:
        raise RuntimeError(f"{provider}_sso_not_configured")

    profile = get_json(profile_url, {"Authorization": f"Bearer {access_token}"})
    email = profile.get("email")
    verified = profile.get("email_verified", False)
    if not isinstance(email, str) or "@" not in email or verified is not True:
        raise ValueError("The identity provider did not return a verified email address.")
    return email.lower()


def require_email_delivery(settings: Settings) -> None:
    """Ensure the configured deployment can safely send verification emails."""
    if settings.email_delivery_mode not in {"console", "smtp"}:
        raise RuntimeError("email_delivery_not_configured")
    if settings.email_delivery_mode == "smtp" and not settings.smtp_host:
        raise RuntimeError("email_delivery_not_configured")


def require_mobile_delivery(settings: Settings) -> None:
    """Ensure the configured deployment can safely deliver mobile OTPs."""
    if settings.mobile_otp_delivery_mode not in {"console", "twilio"}:
        raise RuntimeError("mobile_otp_delivery_not_configured")
    if settings.mobile_otp_delivery_mode == "twilio" and not all(
        [settings.twilio_account_sid, settings.twilio_auth_token, settings.twilio_from_number]
    ):
        raise RuntimeError("mobile_otp_delivery_not_configured")


def send_email_verification(settings: Settings, recipient: str, token: str) -> None:
    """Deliver or locally print a one-time email-verification link according to configuration."""
    # urlencode prevents a signed token from being interpreted as extra URL query syntax.
    link = f"{settings.api_public_url.rstrip('/')}/v1/auth/verify-email?{urlencode({'token': token})}"
    if settings.email_delivery_mode == "console":
        print(f"AA360 email verification for {recipient}: {link}")
        return

    message = EmailMessage()
    message["Subject"] = "Verify your AI Athlete 360 coach account"
    message["From"] = settings.smtp_from
    message["To"] = recipient
    message.set_content(
        "Open this one-time link to verify your coach account. It expires in 60 minutes:\n\n" + link
    )
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as smtp:
        if settings.smtp_starttls:
            smtp.starttls()
        if settings.smtp_username:
            smtp.login(settings.smtp_username, settings.smtp_password)
        smtp.send_message(message)


def send_mobile_otp(settings: Settings, mobile_number: str, otp: str) -> None:
    """Deliver or locally print a short-lived OTP according to the selected transport."""
    body = f"Your AI Athlete 360 verification code is {otp}. It expires in 10 minutes."
    if settings.mobile_otp_delivery_mode == "console":
        print(f"AA360 mobile OTP for {mobile_number}: {otp}")
        return

    endpoint = f"https://api.twilio.com/2010-04-01/Accounts/{settings.twilio_account_sid}/Messages.json"
    request = Request(
        endpoint,
        data=urlencode({"To": mobile_number, "From": settings.twilio_from_number, "Body": body}).encode(),
        method="POST",
    )
    # Twilio expects HTTP Basic credentials as a base64-encoded account SID and auth-token pair.
    credentials = f"{settings.twilio_account_sid}:{settings.twilio_auth_token}".encode()
    request.add_header("Authorization", "Basic " + __import__("base64").b64encode(credentials).decode())
    request.add_header("Content-Type", "application/x-www-form-urlencoded")
    try:
        with urlopen(request, timeout=15) as response:
            if response.status not in {200, 201}:
                raise RuntimeError("mobile_otp_delivery_failed")
    except (HTTPError, URLError) as error:
        raise RuntimeError("mobile_otp_delivery_failed") from error


def post_form(url: str, values: dict[str, str]) -> dict[str, object]:
    """Submit a form-encoded OAuth token request and parse its JSON response."""
    request = Request(url, data=urlencode(values).encode(), method="POST")
    request.add_header("Content-Type", "application/x-www-form-urlencoded")
    return read_json(request)


def get_json(url: str, headers: dict[str, str]) -> dict[str, object]:
    """Fetch a JSON identity-provider resource with the supplied authorization headers."""
    request = Request(url, headers=headers)
    return read_json(request)


def read_json(request: Request) -> dict[str, object]:
    """Execute an outbound identity-provider request with a bounded timeout and safe error."""
    try:
        with urlopen(request, timeout=15) as response:
            return json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError, ValueError) as error:
        raise ValueError("The identity provider could not complete sign-in.") from error


def hash_secret(value: str) -> str:
    """Hash a one-time secret so raw verification values never reach database storage."""
    return hashlib.sha256(value.encode("utf-8")).hexdigest()
