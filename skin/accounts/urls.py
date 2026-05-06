from django.urls import path

from .views import ActivateAccountView, RegisterUserView


urlpatterns = [
    path("register/", RegisterUserView.as_view(), name="register_user"),
    path("activate/<str:token>/", ActivateAccountView.as_view(), name="activate_account"),
]
