# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.db.utils import IntegrityError

# Third party imports
from rest_framework.response import Response
from rest_framework import status

# Module imports
from plane.app.views.base import BaseViewSet
from plane.app.serializers import ProjectGroupSerializer
from plane.app.permissions import ROLE, allow_permission
from plane.db.models import ProjectGroup, Workspace


class ProjectGroupViewSet(BaseViewSet):
    """
    DK fork: workspace-scoped CRUD for sidebar project folders.

    Groups are visible to every member of the workspace. A group may nest
    exactly one level (enforced in the serializer's validate_parent).
    """

    serializer_class = ProjectGroupSerializer
    model = ProjectGroup

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .select_related("workspace")
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def list(self, request, slug):
        groups = ProjectGroupSerializer(self.get_queryset(), many=True).data
        return Response(groups, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def create(self, request, slug):
        try:
            workspace = Workspace.objects.get(slug=slug)
            serializer = ProjectGroupSerializer(data=request.data)
            if serializer.is_valid():
                serializer.save(workspace_id=workspace.id)
                return Response(serializer.data, status=status.HTTP_201_CREATED)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except IntegrityError as e:
            if "already exists" in str(e):
                return Response(
                    {"name": "A group with that name already exists at this level."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            raise

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def partial_update(self, request, slug, pk):
        try:
            group = ProjectGroup.objects.get(pk=pk, workspace__slug=slug)
            serializer = ProjectGroupSerializer(group, data=request.data, partial=True)
            if serializer.is_valid():
                serializer.save()
                return Response(serializer.data, status=status.HTTP_200_OK)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except IntegrityError as e:
            if "already exists" in str(e):
                return Response(
                    {"name": "A group with that name already exists at this level."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            raise

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def destroy(self, request, slug, pk):
        group = ProjectGroup.objects.get(pk=pk, workspace__slug=slug)
        # Projects pointing at this group fall back to ungrouped (SET_NULL).
        # Any subgroups cascade-delete; their projects also fall back to null.
        group.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
