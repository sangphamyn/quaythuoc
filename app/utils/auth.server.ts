import { db } from "./db.server";
import { UserRole } from "@prisma/client";
import { createUserSession } from "./session.server";

interface LoginParams {
  username: string;
  password: string;
  role: UserRole;
}

interface LoginResult {
  success: boolean;
  errors?: {
    username?: string;
    password?: string;
    role?: string;
    login?: string;
  };
  userId?: number;
  userRole?: UserRole;
}

/**
 * Service xử lý đăng nhập
 */
export class AuthService {
  /**
   * Xác thực người dùng và kiểm tra vai trò
   */
  static async login({ username, password, role }: LoginParams): Promise<LoginResult> {
    try {
      // Kiểm tra user có tồn tại
      const user = await db.user.findUnique({
        where: { username },
        select: {
          id: true,
          password: true,
          role: true,
        },
      });

      // Kiểm tra user tồn tại
      if (!user) {
        return {
          success: false,
          errors: {
            username: "Tài khoản không tồn tại"
          }
        };
      }

      // Kiểm tra mật khẩu
      if (!user || user.password !== password) {
        return {
          success: false,
          errors: {
            password: "Mật khẩu không đúng"
          }
        };
      }

      // Kiểm tra user có vai trò phù hợp không
      if (user.role !== role) {
        return {
          success: false,
          errors: {
            role: `Bạn không có quyền truy cập với vai trò ${role}`
          }
        };
      }

      // Đăng nhập thành công
      return {
        success: true,
        userId: user.id,
        userRole: user.role,
      };
    } catch (error) {
      console.error("Login error:", error);
      return {
        success: false,
        errors: {
          login: "Có lỗi xảy ra khi đăng nhập"
        }
      };
    }
  }

  /**
   * Đăng nhập và tạo session
   */
  static async authenticate({ username, password, role }: LoginParams) {
    const result = await this.login({ username, password, role });

    if (!result.success || !result.userId || !result.userRole) {
      return {
        success: false,
        errors: result.errors,
      };
    }

    // Tạo session và redirect
    const redirectTo = role === UserRole.ADMIN ? "/admin" : "/pos";
    return createUserSession({
      userId: result.userId,
      role: result.userRole,
      redirectTo,
    });
  }
}
