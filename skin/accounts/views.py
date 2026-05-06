from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.sites.shortcuts import get_current_site
from django.core.mail import EmailMultiAlternatives
from django.shortcuts import redirect
from django.template.loader import render_to_string
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from rest_framework import generics, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView

from .models import CustomUser
from .serializers import CustomUserSerializer


class RegisterUserView(generics.CreateAPIView):
    queryset = CustomUser.objects.all()
    serializer_class = CustomUserSerializer
    permission_classes = [AllowAny]

    def perform_create(self, serializer):
        user = serializer.save()
        self.send_activation_email(user)

    def send_activation_email(self, user):
        token = urlsafe_base64_encode(force_bytes(user.pk))
        current_site = get_current_site(self.request)
        activation_url = f"http://{current_site.domain}/api/accounts/activate/{token}/"

        html_message = render_to_string(
            "activation_email.html",
            {"user": user, "domain": current_site.domain, "token": token},
        )
        plain_message = (
            f"안녕하세요, {user.email}님.\n\n"
            f"아래 링크를 열어 계정을 활성화해 주세요.\n{activation_url}"
        )

        email = EmailMultiAlternatives(
            "계정 활성화 안내",
            plain_message,
            settings.DEFAULT_FROM_EMAIL,
            [user.email],
        )
        email.attach_alternative(html_message, "text/html")
        email.send(fail_silently=False)


class ActivateAccountView(generics.GenericAPIView):
    permission_classes = [AllowAny]

    def get(self, request, token):
        try:
            uid = urlsafe_base64_decode(token).decode()
            user = CustomUser.objects.get(pk=uid)
        except (TypeError, ValueError, OverflowError, CustomUser.DoesNotExist):
            return Response({"detail": "활성화 링크가 유효하지 않습니다."}, status=status.HTTP_400_BAD_REQUEST)

        user.is_active = True
        user.save(update_fields=["is_active"])
        return redirect("/")


class CustomTokenObtainPairView(TokenObtainPairView):
    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        User = get_user_model()
        user_id = request.data.get("id")
        password = request.data.get("password")

        try:
            user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            return self.invalid_credentials_response()

        if not user.check_password(password):
            return self.invalid_credentials_response()

        if not user.is_active:
            return Response(
                {"detail": "계정 활성화 후 로그인할 수 있습니다."},
                status=status.HTTP_403_FORBIDDEN,
            )

        refresh = RefreshToken.for_user(user)
        return Response(
            {
                "detail": "로그인에 성공했습니다.",
                "access": str(refresh.access_token),
                "refresh": str(refresh),
                "user": {
                    "id": user.id,
                    "email": user.email,
                    "name": user.name,
                    "is_active": user.is_active,
                },
            },
            status=status.HTTP_200_OK,
        )

    def invalid_credentials_response(self):
        return Response(
            {"detail": "아이디 또는 비밀번호가 올바르지 않습니다."},
            status=status.HTTP_401_UNAUTHORIZED,
        )
