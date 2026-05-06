# accounts/admin.py
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import CustomUser

# 사용자 정의 사용자 모델을 관리 사이트에 등록
class CustomUserAdmin(UserAdmin):
    model = CustomUser
    list_display = ('id', 'email', 'name', 'age', 'is_active', 'is_staff')  # 표시할 필드
    list_filter = ('is_staff', 'is_active')  # 필터링 옵션
    ordering = ('email',)  # 정렬 기준
    fieldsets = (
        (None, {'fields': ('id', 'email', 'password')}),
        ('Personal info', {'fields': ('name', 'age')}),
        ('Permissions', {'fields': ('is_active', 'is_staff', 'is_superuser', 'groups', 'user_permissions')}),
        ('Important dates', {'fields': ('last_login',)}),
    )
    add_fieldsets = (
        (None, {
            'classes': ('wide',),
            'fields': ('id', 'email', 'password1', 'password2', 'is_active', 'is_staff')}
        ),
    )

# CustomUserAdmin 클래스를 admin에 등록
admin.site.register(CustomUser, CustomUserAdmin)
