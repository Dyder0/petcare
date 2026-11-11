from rest_framework.permissions import BasePermission


class IsAdministrator(BasePermission):
    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role == request.user.Role.ADMIN
        )


class IsAdministratorOrVeterinarian(BasePermission):
    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role
            in (request.user.Role.ADMIN, request.user.Role.VETERINARIAN)
        )


class IsBillingStaff(BasePermission):
    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role
            in (request.user.Role.ADMIN, request.user.Role.RECEPTION)
        )
