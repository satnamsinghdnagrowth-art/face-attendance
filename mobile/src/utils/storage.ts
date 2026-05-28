import * as SecureStore from 'expo-secure-store';

const ACCESS_TOKEN_KEY = 'access_token';
const REFRESH_TOKEN_KEY = 'refresh_token';
const USER_ID_KEY = 'user_id';
const USER_ROLE_KEY = 'user_role';

export const TokenStorage = {
  saveTokens: async (accessToken: string, refreshToken: string): Promise<void> => {
    await Promise.all([
      SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken),
      SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken),
    ]);
  },

  getAccessToken: (): Promise<string | null> =>
    SecureStore.getItemAsync(ACCESS_TOKEN_KEY),

  getRefreshToken: (): Promise<string | null> =>
    SecureStore.getItemAsync(REFRESH_TOKEN_KEY),

  clearTokens: async (): Promise<void> => {
    await Promise.all([
      SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY).catch(() => {}),
      SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY).catch(() => {}),
    ]);
  },

  hasTokens: async (): Promise<boolean> => {
    const token = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
    return token !== null;
  },
};

export const UserStorage = {
  saveUserId: (userId: string) => SecureStore.setItemAsync(USER_ID_KEY, userId),

  getUserId: () => SecureStore.getItemAsync(USER_ID_KEY),

  saveUserRole: (role: string) => SecureStore.setItemAsync(USER_ROLE_KEY, role),

  getUserRole: () => SecureStore.getItemAsync(USER_ROLE_KEY),

  clear: async () => {
    await Promise.all([
      SecureStore.deleteItemAsync(USER_ID_KEY).catch(() => {}),
      SecureStore.deleteItemAsync(USER_ROLE_KEY).catch(() => {}),
    ]);
  },
};

export const clearAllStorage = async (): Promise<void> => {
  await Promise.all([TokenStorage.clearTokens(), UserStorage.clear()]);
};
