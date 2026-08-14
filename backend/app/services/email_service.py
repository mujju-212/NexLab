"""
Transactional email via Brevo (formerly Sendinblue).

IMPORTANT: OTP verification emails are single, immediate, one-recipient
messages — that's Brevo's TRANSACTIONAL Email API (`TransactionalEmailsApi`
/ `send_transac_email`), not the Campaigns API (`EmailCampaignsApi`), which
is for scheduled bulk sends to a marketing list. Using Campaigns for OTPs
would mean the email doesn't send immediately and requires the recipient
to be added to a Brevo contact list first — wrong tool for this job.
"""
import sib_api_v3_sdk
from sib_api_v3_sdk.rest import ApiException
from flask import current_app


def _client() -> sib_api_v3_sdk.TransactionalEmailsApi:
    configuration = sib_api_v3_sdk.Configuration()
    configuration.api_key['api-key'] = current_app.config['BREVO_API_KEY']
    return sib_api_v3_sdk.TransactionalEmailsApi(sib_api_v3_sdk.ApiClient(configuration))


def send_otp_email(to_email: str, otp_code: str, purpose: str) -> tuple[bool, str | None]:
    """
    Sends a 6-digit OTP code to `to_email`.
    Returns (success, error_message).
    """
    if not current_app.config.get('BREVO_API_KEY'):
        current_app.logger.error('BREVO_API_KEY is not configured — cannot send OTP email')
        return False, 'Email service is not configured'

    context = {
        'individual_register':  'to verify your email and create your NexLab account',
        'institution_register': 'to verify your email and register your institution on NexLab',
    }.get(purpose, 'to verify your email')

    subject = f'Your NexLab verification code: {otp_code}'
    html_content = f"""
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #7c3aed;">NexLab Email Verification</h2>
      <p>Use the code below {context}. This code expires in <strong>10 minutes</strong>.</p>
      <div style="font-size: 32px; font-weight: 700; letter-spacing: 8px; text-align: center;
                  background: #f5f3ff; color: #201b2e; padding: 20px; border-radius: 12px; margin: 24px 0;">
        {otp_code}
      </div>
      <p style="color: #6b7280; font-size: 13px;">
        If you didn't request this, you can safely ignore this email.
      </p>
    </div>
    """

    send_smtp_email = sib_api_v3_sdk.SendSmtpEmail(
        to=[{'email': to_email}],
        sender={
            'name':  current_app.config['BREVO_SENDER_NAME'],
            'email': current_app.config['BREVO_SENDER_EMAIL'],
        },
        subject=subject,
        html_content=html_content,
    )

    try:
        _client().send_transac_email(send_smtp_email)
        return True, None
    except ApiException as e:
        current_app.logger.error(f'Brevo send_transac_email failed: {e}')
        return False, str(e)
