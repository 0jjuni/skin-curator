from django.db import models
from django.contrib.auth import get_user_model


# Create your models here.

class ProductInfo(models.Model):
    brand = models.CharField(max_length=100, verbose_name='브랜드')
    title = models.CharField(max_length=255, verbose_name='제품명')
    discount = models.IntegerField(verbose_name='할인율')
    price = models.IntegerField(verbose_name='가격')  # 쉼표 제거 후 정수형 저장
    etc = models.CharField(max_length=100, verbose_name='기타 정보', null=True, blank=True)
    category = models.CharField(max_length=100, verbose_name='카테고리')
    logo = models.URLField(max_length=500, verbose_name='로고 URL', blank=True)

    def __str__(self):
        return f"{self.brand} - {self.title}"


class ProductFeature(models.Model):
    oily = models.FloatField(verbose_name='지성')
    dry = models.FloatField(verbose_name='건성')
    normal = models.FloatField(verbose_name='중성')
    combination = models.FloatField(verbose_name='복합성')
    sensitive = models.FloatField(verbose_name='민감성')
    acne = models.FloatField(verbose_name='여드름')
    atopy = models.FloatField(verbose_name='아토피')

    teens = models.FloatField(verbose_name='10대')
    twenties = models.FloatField(verbose_name='20대')
    thirties = models.FloatField(verbose_name='30대')
    forties_above = models.FloatField(verbose_name='40대 이상')

    moisture_supply = models.FloatField(verbose_name='보습_수분_공급')
    pore_care = models.FloatField(verbose_name='모공관리관련')
    pigmentation_care = models.FloatField(verbose_name='색소침착관리')
    lip_dry_care = models.FloatField(verbose_name='입술건조관리')

    def __str__(self):
        return f"Feature set for age range: {self.teens}-{self.forties_above}"

User = get_user_model()


class Survey(models.Model):
    # 기본 키는 자동 증가하는 ID를 사용
    id = models.AutoField(primary_key=True)

    # 회원일 경우 user에 사용자 ID를, 비회원일 경우 설문조사 ID를 문자열로 저장
    user = models.CharField(max_length=255, null=True, blank=True, verbose_name='User ID')

    # 설문조사 데이터 필드 (0.2 ~ 1.0으로 변환될 값)
    atopy_level = models.FloatField(verbose_name='아토피 정도', null=False)
    acne_level = models.FloatField(verbose_name='여드름 정도', null=False)
    sensitivity_level = models.FloatField(verbose_name='민감성 정도', null=False)

    def convert_to_float(self, level):
        # 변환 매핑
        conversion_map = {
            1: 0.2,
            2: 0.4,
            3: 0.6,
            4: 0.8,
            5: 1.0
        }

        # 정수인 경우 변환
        if isinstance(level, int):
            return conversion_map.get(level)

        # 실수인 경우 1.0, 0.4 등 특정 매핑된 값인지 확인
        for key, value in conversion_map.items():
            if level == key or level == value:
                return value

        raise ValueError(f"Invalid level: {level}")

    def save(self, *args, **kwargs):
        # 이미 변환된 값인지 확인하고 변환하지 않음
        self.atopy_level = self.convert_to_float(self.atopy_level)
        self.acne_level = self.convert_to_float(self.acne_level)
        self.sensitivity_level = self.convert_to_float(self.sensitivity_level)

        # 비회원인 경우 user 필드에 pk를 문자열로 저장
        if not self.user:
            self.user = str(self.id)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.user if self.user else '비회원'}의 설문조사 결과"
