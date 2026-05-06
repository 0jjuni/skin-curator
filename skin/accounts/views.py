from django.conf import settings
from django.contrib.sites.shortcuts import get_current_site
from django.core.mail import EmailMultiAlternatives
from django.shortcuts import redirect
from django.template.loader import render_to_string
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from rest_framework import generics, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

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
