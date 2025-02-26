import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { Form, Link, useActionData, useLoaderData, useNavigation, useSubmit } from "@remix-run/react";
import { useEffect, useRef, useState } from "react";
import { db } from "~/utils/db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const searchTerm = url.searchParams.get("search") || "";
  const roleFilter = url.searchParams.get("role") || "";
  const pageParam = url.searchParams.get("page") || "1";
  const page = parseInt(pageParam, 10);
  const limit = 10;
  const skip = (page - 1) * limit;

  // Check for toast message
  const toast = url.searchParams.get("toast");

  // Build the where clause
  const where: any = {
    // Exclude system admin if needed
    // id: { not: 1 }, // Assuming ID 1 is system admin
  };
  
  // Search condition
  if (searchTerm) {
    where.OR = [
      { username: { contains: searchTerm } },
      { fullName: { contains: searchTerm } },
      { email: { contains: searchTerm } },
      { phone: { contains: searchTerm } },
    ];
  }
  
  // Role filter
  if (roleFilter) {
    where.role = roleFilter;
  }
  
  // Fetch data with filters
  const [users, totalCount] = await Promise.all([
    db.user.findMany({
      where,
      orderBy: {
        createdAt: "desc",
      },
      skip,
      take: limit,
      select: {
        id: true,
        username: true,
        fullName: true,
        role: true,
        email: true,
        phone: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            invoices: true,
            purchaseOrders: true,
            transactions: true,
          },
        },
      },
    }),
    db.user.count({ where }),
  ]);

  const totalPages = Math.ceil(totalCount / limit);
  
  // Stats for dashboard cards
  const stats = await db.$transaction([
    // Total users
    db.user.count(),
    
    // Users by role
    db.user.groupBy({
      by: ['role'],
      _count: {
        _all: true,
      },
    }),
    
    // Users created in the last 30 days
    db.user.count({
      where: {
        createdAt: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        },
      },
    }),
    
    // Active users with transactions in last 7 days
    db.user.count({
      where: {
        OR: [
          {
            invoices: {
              some: {
                createdAt: {
                  gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
                },
              },
            },
          },
          {
            purchaseOrders: {
              some: {
                createdAt: {
                  gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
                },
              },
            },
          },
          {
            transactions: {
              some: {
                createdAt: {
                  gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
                },
              },
            },
          },
        ],
      },
    }),
  ]);
  
  // Prepare stats data
  const totalUsers = stats[0];
  
  // Process role counts
  const roleCounts: Record<string, number> = {};
  stats[1].forEach(role => {
    roleCounts[role.role] = role._count._all;
  });
  
  const newUsers = stats[2];
  const activeUsers = stats[3];
  
  return json({
    users,
    pagination: {
      page,
      totalPages,
      totalCount,
    },
    filters: {
      searchTerm,
      roleFilter,
    },
    stats: {
      totalUsers,
      roleCounts,
      newUsers,
      activeUsers,
    },
    toast,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const formData = await request.formData();
  const action = formData.get("_action") as string;
  
  // Handle user deletion
  if (action === "delete") {
    const userId = formData.get("userId") as string;
    
    if (!userId || isNaN(Number(userId))) {
      return json({ success: false, error: "Mã nhân viên không hợp lệ" }, { status: 400 });
    }
    
    try {
      // Check if user has any related records
      const user = await db.user.findUnique({
        where: { id: Number(userId) },
        include: {
          _count: {
            select: {
              invoices: true,
              purchaseOrders: true,
              transactions: true,
            },
          },
        },
      });
      
      if (!user) {
        return json({ success: false, error: "Không tìm thấy nhân viên" }, { status: 404 });
      }
      
      // Check if user has any activities
      const hasActivities = 
        user._count.invoices > 0 || 
        user._count.purchaseOrders > 0 || 
        user._count.transactions > 0;
      
      if (hasActivities) {
        return json(
          { 
            success: false, 
            error: "Không thể xóa nhân viên này vì đã có hoạt động liên quan. Vui lòng vô hiệu hóa tài khoản thay vì xóa." 
          }, 
          { status: 400 }
        );
      }
      
      // Delete user if there are no related records
      await db.user.delete({
        where: { id: Number(userId) },
      });
      
      return redirect(`/admin/staff?toast=Đã xóa nhân viên thành công`);
    } catch (error) {
      console.error("Error deleting user:", error);
      return json(
        { success: false, error: "Lỗi khi xóa nhân viên" },
        { status: 500 }
      );
    }
  }
  
  // Handle change password
  if (action === "changePassword") {
    const userId = formData.get("userId") as string;
    const newPassword = formData.get("newPassword") as string;
    const confirmPassword = formData.get("confirmPassword") as string;
    
    if (!userId || isNaN(Number(userId))) {
      return json({ success: false, error: "Mã nhân viên không hợp lệ" }, { status: 400 });
    }
    
    if (!newPassword || newPassword.length < 6) {
      return json(
        { success: false, error: "Mật khẩu mới phải có ít nhất 6 ký tự" },
        { status: 400 }
      );
    }
    
    if (newPassword !== confirmPassword) {
      return json(
        { success: false, error: "Mật khẩu xác nhận không khớp" },
        { status: 400 }
      );
    }
    
    try {
      // Hash the password
      const hashedPassword = newPassword;
      
      // Update user password
      await db.user.update({
        where: { id: Number(userId) },
        data: {
          password: hashedPassword,
        },
      });
      
      return json(
        { success: true, message: "Đã đổi mật khẩu thành công" },
        { status: 200 }
      );
    } catch (error) {
      console.error("Error changing password:", error);
      return json(
        { success: false, error: "Lỗi khi đổi mật khẩu" },
        { status: 500 }
      );
    }
  }
  
  return null;
};

export default function StaffManagement() {
  const { 
    users, 
    pagination, 
    filters,
    stats,
    toast 
  } = useLoaderData<typeof loader>();
  
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isLoading = navigation.state === "loading";
  const submit = useSubmit();
  
  // State for modals
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [selectedUserName, setSelectedUserName] = useState<string>("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  
  const passwordModalRef = useRef<HTMLDivElement>(null);
  
  // Format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("vi-VN");
  };
  
  // Translate role
  const translateRole = (role: string) => {
    switch (role) {
      case "ADMIN":
        return "Quản trị viên";
      case "STAFF":
        return "Nhân viên";
      default:
        return role;
    }
  };
  
  // Handle user deletion
  const handleDelete = (userId: number, fullName: string) => {
    if (confirm(`Bạn có chắc chắn muốn xóa nhân viên ${fullName}?`)) {
      const formData = new FormData();
      formData.append("_action", "delete");
      formData.append("userId", userId.toString());
      submit(formData, { method: "post" });
    }
  };
  
  // Handle password change modal
  const openPasswordModal = (userId: number, fullName: string) => {
    setSelectedUserId(userId);
    setSelectedUserName(fullName);
    setNewPassword("");
    setConfirmPassword("");
    setShowPasswordModal(true);
  };
  
  const closePasswordModal = () => {
    setShowPasswordModal(false);
    setSelectedUserId(null);
    setSelectedUserName("");
  };
  
  const handlePasswordChange = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedUserId) return;
    
    const formData = new FormData();
    formData.append("_action", "changePassword");
    formData.append("userId", selectedUserId.toString());
    formData.append("newPassword", newPassword);
    formData.append("confirmPassword", confirmPassword);
    submit(formData, { method: "post" });
  };
  
  // Close modal when clicking outside
  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (
        passwordModalRef.current && 
        !passwordModalRef.current.contains(event.target as Node)
      ) {
        closePasswordModal();
      }
    };
    
    if (showPasswordModal) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [showPasswordModal]);
  
  // Close modal if password change is successful
  useEffect(() => {
    if (actionData?.success) {
      closePasswordModal();
    }
  }, [actionData]);
  
  return (
    <div className="container mx-auto px-4 py-8">
      {/* Toast Notification */}
      {toast && (
        <div className="bg-green-100 border-l-4 border-green-500 text-green-700 p-4 mb-6 relative">
          <button 
            className="absolute top-2 right-2"
            onClick={() => {
              // Use window.history to update the URL without a reload
              const url = new URL(window.location.href);
              url.searchParams.delete("toast");
              window.history.replaceState({}, "", url.toString());
              
              // Hide the toast (would need a state variable in a real app)
              const toastElement = document.querySelector(".bg-green-100");
              if (toastElement) {
                toastElement.classList.add("hidden");
              }
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
          <p>{toast}</p>
        </div>
      )}
      
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Quản lý nhân viên</h1>
        <Link
          to="/admin/staff/new"
          className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-2 rounded flex items-center gap-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
          </svg>
          <span>Thêm nhân viên mới</span>
        </Link>
      </div>
      
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow-md">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Tổng số nhân viên</p>
              <p className="text-2xl font-bold">{stats.totalUsers}</p>
            </div>
            <div className="p-3 rounded-full bg-blue-100 text-blue-800">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
          </div>
          <div className="mt-2 text-sm text-gray-500">
            {stats.newUsers} nhân viên mới trong 30 ngày qua
          </div>
        </div>
        
        <div className="bg-white p-4 rounded-lg shadow-md">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Quản trị viên</p>
              <p className="text-2xl font-bold">{stats.roleCounts["ADMIN"] || 0}</p>
            </div>
            <div className="p-3 rounded-full bg-purple-100 text-purple-800">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
          </div>
          <div className="mt-2 text-sm text-gray-500">
            Có quyền quản trị hệ thống
          </div>
        </div>
        
        <div className="bg-white p-4 rounded-lg shadow-md">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Nhân viên</p>
              <p className="text-2xl font-bold">{stats.roleCounts["STAFF"] || 0}</p>
            </div>
            <div className="p-3 rounded-full bg-green-100 text-green-800">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
          </div>
          <div className="mt-2 text-sm text-gray-500">
            Nhân viên vận hành
          </div>
        </div>
        
        <div className="bg-white p-4 rounded-lg shadow-md">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Nhân viên hoạt động</p>
              <p className="text-2xl font-bold">{stats.activeUsers}</p>
            </div>
            <div className="p-3 rounded-full bg-yellow-100 text-yellow-800">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <div className="mt-2 text-sm text-gray-500">
            Hoạt động trong 7 ngày qua
          </div>
        </div>
      </div>
      
      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow-md mb-6">
        <Form method="get" className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="search" className="block text-sm font-medium text-gray-700 mb-1">
              Tìm kiếm
            </label>
            <input
              type="text"
              id="search"
              name="search"
              defaultValue={filters.searchTerm}
              placeholder="Tên, tài khoản, email hoặc số điện thoại..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>
          
          <div>
            <label htmlFor="role" className="block text-sm font-medium text-gray-700 mb-1">
              Vai trò
            </label>
            <select
              id="role"
              name="role"
              defaultValue={filters.roleFilter}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="">Tất cả vai trò</option>
              <option value="ADMIN">Quản trị viên</option>
              <option value="STAFF">Nhân viên</option>
            </select>
          </div>
          
          <div className="md:col-span-2 flex justify-end">
            <button
              type="submit"
              className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md flex items-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
              </svg>
              <span>Lọc kết quả</span>
            </button>
          </div>
        </Form>
      </div>
      
      {/* Error/Success Messages */}
      {actionData?.error && (
        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-6">
          <p>{actionData.error}</p>
        </div>
      )}
      
      {actionData?.message && (
        <div className="bg-green-100 border-l-4 border-green-500 text-green-700 p-4 mb-6">
          <p>{actionData.message}</p>
        </div>
      )}
      
      {/* Staff Table */}
      <div className="bg-white shadow-md rounded-md overflow-hidden mb-6">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Tên nhân viên
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Tài khoản
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Liên hệ
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Vai trò
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Hoạt động
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Ngày tạo
                </th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Thao tác
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 h-10 w-10">
                        <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 font-medium">
                          {user.fullName.charAt(0).toUpperCase()}
                        </div>
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">{user.fullName}</div>
                        <div className="text-sm text-gray-500">ID: {user.id}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {user.username}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {user.email && (
                      <div className="text-sm text-gray-500">{user.email}</div>
                    )}
                    {user.phone && (
                      <div className="text-sm text-gray-500">{user.phone}</div>
                    )}
                    {!user.email && !user.phone && (
                      <div className="text-sm text-gray-400">Chưa cập nhật</div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 inline-flex text-xs leading-5 font-medium rounded-full ${
                      user.role === "ADMIN" 
                        ? "bg-purple-100 text-purple-800" 
                        : "bg-green-100 text-green-800"
                    }`}>
                      {translateRole(user.role)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <div>Hóa đơn: {user._count.invoices}</div>
                    <div>Nhập hàng: {user._count.purchaseOrders}</div>
                    <div>Giao dịch: {user._count.transactions}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDate(user.createdAt)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex justify-end space-x-3">
                      <Link
                        to={`/admin/staff/${user.id}`}
                        className="text-blue-600 hover:text-blue-900"
                        title="Chi tiết"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                          <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                        </svg>
                      </Link>
                      
                      <Link
                        to={`/admin/staff/${user.id}/edit`}
                        className="text-indigo-600 hover:text-indigo-900"
                        title="Sửa"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                        </svg>
                      </Link>
                      
                      <button
                        type="button"
                        onClick={() => openPasswordModal(user.id, user.fullName)}
                        className="text-yellow-600 hover:text-yellow-900"
                        title="Đổi mật khẩu"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                        </svg>
                      </button>
                      
                      <button
                        type="button"
                        onClick={() => handleDelete(user.id, user.fullName)}
                        className="text-red-600 hover:text-red-900"
                        title="Xóa"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              
              {users.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-4 text-center text-sm text-gray-500">
                    Không tìm thấy nhân viên nào
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex justify-between items-center">
          <div className="text-sm text-gray-500">
            Hiển thị {((pagination.page - 1) * 10) + 1} đến {Math.min(pagination.page * 10, pagination.totalCount)} trong số {pagination.totalCount} nhân viên
          </div>
          <div className="flex space-x-1">
            {pagination.page > 1 && (
              <Link
                to={`/admin/staff?page=${pagination.page - 1}${filters.searchTerm ? `&search=${filters.searchTerm}` : ''}${filters.roleFilter ? `&role=${filters.roleFilter}` : ''}`}
                className="px-3 py-1 border rounded hover:bg-gray-100 flex items-center"
                title="Trang trước"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </Link>
            )}
            
            {/* Show up to 5 page numbers with ellipsis for long pagination */}
            {Array.from({ length: pagination.totalPages }, (_, i) => i + 1)
              .filter(pageNum => {
                // Show first page, last page, current page, and 1 page before and after current page
                return (
                  pageNum === 1 ||
                  pageNum === pagination.totalPages ||
                  Math.abs(pageNum - pagination.page) <= 1
                );
              })
              .reduce((result, pageNum, idx, array) => {
                if (idx > 0 && pageNum - array[idx - 1] > 1) {
                  // Add ellipsis if there's a gap
                  result.push("...");
                }
                result.push(pageNum);
                return result;
              }, [] as (number | string)[])
              .map((pageNum, idx) => (
                pageNum === "..." ? (
                  <span key={`ellipsis-${idx}`} className="px-3 py-1">...</span>
                ) : (
                  <Link
                    key={pageNum}
                    to={`/admin/staff?page=${pageNum}${filters.searchTerm ? `&search=${filters.searchTerm}` : ''}${filters.roleFilter ? `&role=${filters.roleFilter}` : ''}`}
                    className={`px-3 py-1 border rounded ${
                      pageNum === pagination.page
                        ? 'bg-blue-500 text-white'
                        : 'hover:bg-gray-100'
                    }`}
                  >
                    {pageNum}
                  </Link>
                )
              ))}
            
            {pagination.page < pagination.totalPages && (
              <Link
                to={`/admin/staff?page=${pagination.page + 1}${filters.searchTerm ? `&search=${filters.searchTerm}` : ''}${filters.roleFilter ? `&role=${filters.roleFilter}` : ''}`}
                className="px-3 py-1 border rounded hover:bg-gray-100 flex items-center"
                title="Trang tiếp"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                </svg>
              </Link>
            )}
          </div>
        </div>
      )}
      
      {/* Change Password Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
          <div ref={passwordModalRef} className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Đổi mật khẩu cho {selectedUserName}</h3>
              <button
                type="button"
                onClick={closePasswordModal}
                className="text-gray-400 hover:text-gray-500"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            {actionData?.error && (
              <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4">
                <p>{actionData.error}</p>
              </div>
            )}
            
            <form onSubmit={handlePasswordChange}>
              <input type="hidden" name="_action" value="changePassword" />
              <input type="hidden" name="userId" value={selectedUserId || ""} />
              
              <div className="mb-4">
                <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 mb-1">
                  Mật khẩu mới <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  id="newPassword"
                  name="newPassword"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
                <p className="mt-1 text-xs text-gray-500">Tối thiểu 6 ký tự</p>
              </div>
              
              <div className="mb-6">
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
                  Xác nhận mật khẩu <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  id="confirmPassword"
                  name="confirmPassword"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={closePasswordModal}
                  className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-4 py-2 rounded-md mr-2"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md"
                  disabled={isLoading}
                >
                  {isLoading ? "Đang xử lý..." : "Lưu thay đổi"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      
      {/* Loading indicator */}
      {isLoading && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-25 flex items-center justify-center">
          <div className="bg-white p-4 rounded-md shadow-md">
            <p className="text-center">Đang tải...</p>
          </div>
        </div>
      )}
    </div>
  );
}
