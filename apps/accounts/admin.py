from django.contrib import admin
from django.contrib.auth.forms import UserChangeForm, UserCreationForm
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from apps.accounts.models import User


class PetCareUserCreationForm(UserCreationForm):
    class Meta:
        model = User
        fields = ("email", "name", "role", "specialty")


class PetCareUserChangeForm(UserChangeForm):
    class Meta:
        model = User
        fields = "__all__"


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    add_form = PetCareUserCreationForm
    form = PetCareUserChangeForm
    ordering = ["email"]
    list_display = ["email", "name", "role", "is_active", "is_staff"]
    search_fields = ["email", "name"]
    readonly_fields = ["last_login", "date_joined"]
    fieldsets = [
        (None, {"fields": ["email", "password"]}),
        ("Perfil", {"fields": ["name", "role", "specialty"]}),
        (
            "Permisos",
            {
                "fields": [
                    "is_active",
                    "is_staff",
                    "is_superuser",
                    "groups",
                    "user_permissions",
                ]
            },
        ),
        ("Fechas", {"fields": ["last_login", "date_joined"]}),
    ]
    add_fieldsets = [
        (
            None,
            {
                "classes": ["wide"],
                "fields": ["email", "name", "role", "password1", "password2"],
            },
        )
    ]
    filter_horizontal = ["groups", "user_permissions"]
