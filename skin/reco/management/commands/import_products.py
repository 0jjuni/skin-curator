import csv
import re
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from reco.models import ProductFeature, ProductInfo


DEFAULT_DATA_DIR = Path("C:/Users/iyoun/Desktop/03_프로젝트_코드/1.데이터/origin/data")


def clean_key(*parts):
    value = "|".join((part or "").strip() for part in parts)
    return re.sub(r"\s+", "", value).casefold()


def read_csv(path):
    with path.open("r", encoding="utf-8-sig", newline="") as file:
        return list(csv.DictReader(file))


def parse_int(value):
    text = str(value or "").strip()
    if not text:
        return 0
    digits = re.sub(r"[^0-9-]", "", text)
    if not digits or digits == "-":
        return 0
    return int(digits)


def parse_float(row, column):
    value = row.get(column, "")
    try:
        return float(str(value).strip() or 0)
    except (TypeError, ValueError):
        return 0.0


def average(row, columns):
    values = [parse_float(row, column) for column in columns if column in row]
    return sum(values) / len(values) if values else 0.0


class Command(BaseCommand):
    help = "Import product information and recommendation feature vectors from local CSV files."

    def add_arguments(self, parser):
        parser.add_argument(
            "--data-dir",
            default=str(DEFAULT_DATA_DIR),
            help="Directory containing info.csv, filled_reco.csv, and logo.csv.",
        )

    def handle(self, *args, **options):
        data_dir = Path(options["data_dir"])
        info_path = data_dir / "info.csv"
        reco_path = data_dir / "filled_reco.csv"
        logo_path = data_dir / "logo.csv"

        missing = [path for path in [info_path, reco_path] if not path.exists()]
        if missing:
            names = ", ".join(str(path) for path in missing)
            raise CommandError(f"Required CSV file not found: {names}")

        info_rows = read_csv(info_path)
        reco_rows = read_csv(reco_path)
        if len(info_rows) != len(reco_rows):
            raise CommandError(
                f"Row count mismatch: info.csv={len(info_rows)}, filled_reco.csv={len(reco_rows)}"
            )

        logo_by_product = {}
        if logo_path.exists():
            for row in read_csv(logo_path):
                logo_by_product[clean_key(row.get("brand"), row.get("title"))] = row.get("logo", "").strip()

        products = []
        features = []
        logo_matches = 0

        for index, (info, reco) in enumerate(zip(info_rows, reco_rows), start=1):
            logo = logo_by_product.get(clean_key(info.get("Brand"), info.get("Title")), "")
            if logo:
                logo_matches += 1

            products.append(
                ProductInfo(
                    id=index,
                    brand=(info.get("Brand") or "").strip(),
                    title=(info.get("Title") or "").strip(),
                    discount=parse_int(info.get("Discount")),
                    price=parse_int(info.get("Price")),
                    etc=(info.get("Etc") or "").strip(),
                    category=(info.get("category") or "").strip(),
                    logo=logo,
                )
            )

            moisture_supply = average(
                reco,
                ["수분있는", "보습잘되는", "속건조에효과있는", "편안해지는", "부드러워지는"],
            )
            features.append(
                ProductFeature(
                    id=index,
                    oily=parse_float(reco, "지성"),
                    dry=parse_float(reco, "건성"),
                    normal=parse_float(reco, "중성"),
                    combination=parse_float(reco, "복합성"),
                    sensitive=parse_float(reco, "민감성"),
                    acne=parse_float(reco, "여드름"),
                    atopy=parse_float(reco, "아토피"),
                    teens=parse_float(reco, "10대"),
                    twenties=parse_float(reco, "20대"),
                    thirties=parse_float(reco, "30대"),
                    forties_above=parse_float(reco, "40대 이상"),
                    moisture_supply=moisture_supply,
                    pore_care=average(
                        reco,
                        ["모공관리되는", "블랙헤드없어지는", "피지없어지는", "화이트헤드없어지는", "노폐물제거되는"],
                    ),
                    pigmentation_care=average(
                        reco,
                        ["브리이트닝효과있는", "미백효과가있는", "안색이개선되는", "피부톤이개선되는"],
                    ),
                    lip_dry_care=average(
                        reco,
                        ["수분있는", "보습잘되는", "속건조에효과있는", "각질제거잘되는"],
                    )
                    or moisture_supply,
                )
            )

        with transaction.atomic():
            ProductFeature.objects.all().delete()
            ProductInfo.objects.all().delete()
            ProductInfo.objects.bulk_create(products, batch_size=500)
            ProductFeature.objects.bulk_create(features, batch_size=500)

        self.stdout.write(
            self.style.SUCCESS(
                f"Imported {len(products)} products and {len(features)} feature vectors. "
                f"Logo matches: {logo_matches}/{len(products)}."
            )
        )
