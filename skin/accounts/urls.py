# accounts/urls.py
from django.urls import path
from .views import RegisterUserView, CustomTokenObtainPairView, ActivateAccountView  # 로그인 뷰도 포함

urlpatterns = [
    path('register/', RegisterUserView.as_view(), name='register_user'),  # 사용자 등록 엔드포인트
    path('activate/<str:token>/', ActivateAccountView.as_view(), name='activate_account'),  # 계정 활성화 엔드포인트
    path('login/', CustomTokenObtainPairView.as_view(), name='token_obtain_pair'),  # 로그인 엔드포인트

]
