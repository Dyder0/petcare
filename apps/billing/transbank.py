from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from transbank.common.integration_api_keys import IntegrationApiKeys
from transbank.common.integration_commerce_codes import IntegrationCommerceCodes
from transbank.common.integration_type import IntegrationType
from transbank.common.options import WebpayOptions
from transbank.webpay.webpay_plus.transaction import Transaction


def get_transbank_transaction():
    if settings.TRANSBANK_ENVIRONMENT == "INTEGRATION":
        commerce_code = (
            settings.TRANSBANK_COMMERCE_CODE
            or IntegrationCommerceCodes.WEBPAY_PLUS
        )
        api_key = settings.TRANSBANK_API_KEY or IntegrationApiKeys.WEBPAY
        integration_type = IntegrationType.TEST
    elif settings.TRANSBANK_ENVIRONMENT == "PRODUCTION":
        commerce_code = settings.TRANSBANK_COMMERCE_CODE
        api_key = settings.TRANSBANK_API_KEY
        integration_type = IntegrationType.LIVE
        if not commerce_code or not api_key:
            raise ImproperlyConfigured(
                "Production requires TRANSBANK_COMMERCE_CODE and TRANSBANK_API_KEY."
            )
    else:
        raise ImproperlyConfigured(
            "TRANSBANK_ENVIRONMENT must be INTEGRATION or PRODUCTION."
        )

    return Transaction(
        WebpayOptions(commerce_code, api_key, integration_type)
    )


def create_transbank_transaction(*, buy_order, session_id, amount, return_url):
    return get_transbank_transaction().create(
        buy_order=buy_order,
        session_id=session_id,
        amount=amount,
        return_url=return_url,
    )
