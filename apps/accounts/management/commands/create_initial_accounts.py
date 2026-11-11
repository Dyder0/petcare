from getpass import getpass

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.accounts.models import User


class Command(BaseCommand):
    help = "Crea las cuentas iniciales que falten: un administrador y dos veterinarios."

    def handle(self, *args, **options):
        accounts = []
        if not User.objects.filter(
            role=User.Role.ADMIN,
            is_active=True,
            is_staff=True,
            is_superuser=True,
        ).exists():
            accounts.append(
                self._prompt_account(User.Role.ADMIN, "Administrador/a")
            )

        veterinarian_count = User.objects.filter(
            role=User.Role.VETERINARIAN, is_active=True
        ).count()
        for index in range(veterinarian_count, 2):
            accounts.append(
                self._prompt_account(
                    User.Role.VETERINARIAN, f"Veterinario/a {index + 1}"
                )
            )

        if not accounts:
            self.stdout.write(
                self.style.SUCCESS("Las cuentas iniciales ya están completas.")
            )
            return

        if len({email for _, _, email, _ in accounts}) != len(accounts):
            raise CommandError("Usa un correo distinto para cada cuenta.")
        with transaction.atomic():
            created = [
                User.objects.create_superuser(
                    email=email, password=password, name=name, role=role
                )
                if role == User.Role.ADMIN
                else User.objects.create_user(
                    email=email, password=password, name=name, role=role
                )
                for role, name, email, password in accounts
            ]

        self.stdout.write(self.style.SUCCESS("Cuentas creadas:"))
        for user in created:
            self.stdout.write(f"- {user.email} ({user.get_role_display()})")

    def _prompt_account(self, role, name):
        self.stdout.write(f"\nCuenta {role}:")
        email = input("Correo: ").strip().lower()
        try:
            validate_email(email)
        except ValidationError as exc:
            raise CommandError("Ingresa un correo válido.") from exc
        if User.objects.filter(email__iexact=email).exists():
            raise CommandError(f"El correo {email} ya está registrado.")

        password = getpass("Contraseña (no se mostrará): ")
        confirmation = getpass("Confirma la contraseña: ")
        if password != confirmation:
            raise CommandError("Las contraseñas no coinciden.")

        candidate = User(email=email, name=name, role=role)
        try:
            validate_password(password, user=candidate)
        except ValidationError as exc:
            raise CommandError("; ".join(exc.messages)) from exc

        return role, name, email, password
