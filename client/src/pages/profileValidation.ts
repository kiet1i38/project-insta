import type {
  OwnProfile,
  UpdateOwnProfileInput
} from "../modules/auth/authApi";

export type ProfileFormValues = {
  avatarUrl: string;
  bio: string;
  displayName: string;
};

export type ProfileFormErrors = Partial<Record<keyof ProfileFormValues, string>>;

export function toProfileFormValues(profile: OwnProfile): ProfileFormValues {
  return {
    avatarUrl: profile.avatarUrl ?? "",
    bio: profile.bio ?? "",
    displayName: profile.displayName ?? ""
  };
}

export function validateProfileForm(
  values: ProfileFormValues
): ProfileFormErrors {
  const errors: ProfileFormErrors = {};
  const displayName = values.displayName.trim();
  const bio = values.bio.trim();
  const avatarUrl = values.avatarUrl.trim();

  if (!displayName) {
    errors.displayName = "Display name is required.";
  } else if (displayName.length > 50) {
    errors.displayName = "Display name must be 50 characters or fewer.";
  }

  if (bio.length > 160) {
    errors.bio = "Bio must be 160 characters or fewer.";
  }

  if (avatarUrl.length > 0) {
    try {
      new URL(avatarUrl);
    } catch {
      errors.avatarUrl = "Avatar URL must be valid.";
    }
  }

  return errors;
}

export function buildProfileUpdateInput(
  values: ProfileFormValues
): UpdateOwnProfileInput {
  const displayName = values.displayName.trim();
  const bio = values.bio.trim();
  const avatarUrl = values.avatarUrl.trim();

  return {
    avatarUrl: avatarUrl.length > 0 ? avatarUrl : null,
    bio: bio.length > 0 ? bio : null,
    displayName
  };
}
