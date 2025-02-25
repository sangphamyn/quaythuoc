import { createCookieSessionStorage, redirect } from "@remix-run/node";
import { UserRole } from "@prisma/client";

// Định nghĩa kiểu dữ liệu của session
type SessionData = {
  userId: number;
  userRole: UserRole;
};

type SessionFlashData = {
  error: string;
};

// Thiết lập session storage
const sessionStorage = createCookieSessionStorage<SessionData, SessionFlashData>({
  cookie: {
    name: "pharmacy_session",
    secure: process.env.NODE_ENV === "production",
    secrets: [process.env.SESSION_SECRET || "pharmacy-secret"],
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
    httpOnly: true,
  },
});

interface CreateSessionParams {
  userId: number;
  role: UserRole;
  redirectTo: string;
}

// Tạo session
export async function createUserSession({
  userId,
  role,
  redirectTo,
}: CreateSessionParams) {
  const session = await sessionStorage.getSession();
  session.set("userId", userId);
  session.set("userRole", role);
  
  return redirect(redirectTo, {
    headers: {
      "Set-Cookie": await sessionStorage.commitSession(session),
    },
  });
}

// Lấy session
export async function getUserSession(request: Request) {
  return sessionStorage.getSession(request.headers.get("Cookie"));
}

// Lấy thông tin user từ session
export async function getUserId(request: Request): Promise<number | null> {
  const session = await getUserSession(request);
  const userId = session.get("userId");
  if (!userId) return null;
  return userId;
}

// Kiểm tra user role
export async function getUserRole(request: Request): Promise<UserRole | null> {
  const session = await getUserSession(request);
  const userRole = session.get("userRole");
  if (!userRole) return null;
  return userRole;
}

// Yêu cầu user đăng nhập
export async function requireUserId(
  request: Request, 
  redirectTo: string = "/login"
): Promise<number> {
  const userId = await getUserId(request);
  
  if (!userId) {
    throw redirect(redirectTo);
  }
  
  return userId;
}

// Yêu cầu vai trò ADMIN
export async function requireAdmin(request: Request): Promise<number> {
  const userId = await requireUserId(request);
  const userRole = await getUserRole(request);
  
  if (userRole !== UserRole.ADMIN) {
    throw redirect("/unauthorized");
  }
  
  return userId;
}

// Yêu cầu vai trò STAFF
export async function requireStaff(request: Request): Promise<number> {
  const userId = await requireUserId(request);
  const userRole = await getUserRole(request);
  
  if (userRole !== UserRole.STAFF) {
    throw redirect("/unauthorized");
  }
  
  return userId;
}

// Đăng xuất
export async function logout(request: Request) {
  const session = await getUserSession(request);
  
  return redirect("/login", {
    headers: {
      "Set-Cookie": await sessionStorage.destroySession(session),
    },
  });
}
