from django.contrib import admin
from django.urls import include, path
from config.views import home
from rest_framework.routers import DefaultRouter

from apps.accounts.views import ProfileView, UserViewSet
from apps.appointments.views import (
    AppointmentViewSet,
    AvailabilityView,
    ScheduleView,
)
from apps.billing.views import DebtViewSet, PaymentViewSet, TransbankReturnView
from apps.billing.public_views import (
    public_payment_page,
    public_payment_portal,
    public_payment_return,
)
from apps.medical.views import MedicalRecordViewSet, ReminderViewSet
from apps.patients.views import PetViewSet, TutorViewSet

router = DefaultRouter()
router.register("users", UserViewSet, basename="user")
router.register("tutors", TutorViewSet, basename="tutor")
router.register("pets", PetViewSet, basename="pet")
router.register("appointments", AppointmentViewSet, basename="appointment")
router.register("medical-records", MedicalRecordViewSet, basename="medical-record")
router.register("reminders", ReminderViewSet, basename="reminder")
router.register("debts", DebtViewSet, basename="debt")
router.register("payments", PaymentViewSet, basename="payment")

urlpatterns = [
    path("", home, name="home"),
    path("pagar/", public_payment_portal, name="public-payment-portal"),
    path(
        "pagar/<str:token>/retorno/",
        public_payment_return,
        name="public-payment-return",
    ),
    path("pagar/<str:token>/", public_payment_page, name="public-payment"),
    path("admin/", admin.site.urls),
    path("api/auth/me/", ProfileView.as_view(), name="profile"),
    path("api/auth/", include("apps.accounts.urls")),
    path("api/schedule/", ScheduleView.as_view(), name="schedule"),
    path("api/availability/", AvailabilityView.as_view(), name="availability"),
    path(
        "api/payments/transbank/return/",
        TransbankReturnView.as_view(),
        name="transbank-return",
    ),
    path("api/", include(router.urls)),
]
