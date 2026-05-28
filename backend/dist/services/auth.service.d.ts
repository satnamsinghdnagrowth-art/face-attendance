import { User, PublicUser, LoginResult, TokenPair, UserRole } from '../types';
export declare class AuthService {
    login(email: string, password: string): Promise<LoginResult>;
    register(userData: {
        name: string;
        email: string;
        password: string;
        phone?: string;
        role: UserRole;
    }): Promise<PublicUser>;
    refreshToken(token: string): Promise<TokenPair>;
    logout(userId: string, refreshToken: string, accessToken?: string): Promise<void>;
    logoutAll(userId: string): Promise<void>;
    forgotPassword(email: string): Promise<void>;
    resetPassword(userId: string, otp: string, newPassword: string): Promise<void>;
    generateOTP(userId: string, type?: string): Promise<string>;
    verifyOTP(userId: string, otp: string, type?: string): Promise<boolean>;
    getUserById(userId: string): Promise<PublicUser>;
    findUserByEmail(email: string): Promise<User | null>;
}
export declare const authService: AuthService;
export default authService;
//# sourceMappingURL=auth.service.d.ts.map