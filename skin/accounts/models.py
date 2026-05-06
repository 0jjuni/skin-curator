# accounts/models.py
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models

class CustomUserManager(BaseUserManager):
    def create_user(self, id, email, password=None, **extra_fields):
        if not email:
            raise ValueError("이메일 주소는 필수입니다.")
        email = self.normalize_email(email)
        user = self.model(id=id, email=email, **extra_fields)
        user.set_password(password)
        user.is_active = False  # 기본적으로 비활성화 상태로 설정
        user.save(using=self._db)
        return user

    def create_superuser(self, id, email, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)

        return self.create_user(id, email, password, **extra_fields)

class CustomUser(AbstractBaseUser, PermissionsMixin):
    id = models.CharField(max_length=30, unique=True, primary_key=True)  # 아이디 필드
    age = models.PositiveIntegerField()  # 나이 필드
    name = models.CharField(max_length=50)  # 이름 필드
    email = models.EmailField(unique=True)  # 이메일 필드
    is_active = models.BooleanField(default=False)  # 활성화 여부 (기본값 False)
    is_staff = models.BooleanField(default=False)  # 관리자인지 여부

    objects = CustomUserManager()

    USERNAME_FIELD = 'id'  # 로그인 할 때, 아이디로 받을 칸
    REQUIRED_FIELDS = ['email', 'age', 'name']  # 필수 입력 필드

    def __str__(self):
        return self.email
