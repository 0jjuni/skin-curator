# Generated manually for local CSV product imports.

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("reco", "0001_initial"),
    ]

    operations = [
        migrations.AlterField(
            model_name="productinfo",
            name="logo",
            field=models.URLField(blank=True, max_length=500, verbose_name="로고 URL"),
        ),
    ]
