import uuid

import apps.billing.models
from django.db import migrations, models


def populate_payment_tokens(apps, schema_editor):
    Debt = apps.get_model("billing", "Debt")
    for debt in Debt.objects.using(schema_editor.connection.alias).filter(
        payment_token__isnull=True
    ):
        debt.payment_token = uuid.uuid4().hex
        debt.save(update_fields=["payment_token"])


class Migration(migrations.Migration):

    dependencies = [
        ("billing", "0003_payment_response_code_payment_status_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="debt",
            name="payment_token",
            field=models.CharField(blank=True, max_length=32, null=True),
        ),
        migrations.RunPython(
            populate_payment_tokens,
            migrations.RunPython.noop,
        ),
        migrations.AlterField(
            model_name="debt",
            name="payment_token",
            field=models.CharField(
                default=apps.billing.models.new_payment_token,
                editable=False,
                max_length=32,
                unique=True,
            ),
        ),
    ]
