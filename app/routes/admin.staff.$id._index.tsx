import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import { db } from "~/utils/db.server";

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
  const userId = params.id;
  
  if (!userId || isNaN(Number(userId))) {
    throw json({ message: "Mã nhân viên không hợp lệ" }, { status: 400 });
  }
  
  const user = await db.user.findUnique({
    where: {
      id: Number(userId),
    },
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
    throw json({ message: "Không tìm thấy nhân viên" }, { status: 404 });
  }
  
  // Get recent activities
  const [recentInvoices, recentPurchaseOrders, recentTransactions] = await Promise.all([
    db.invoice.findMany({
      where: {
        userId: Number(userId),
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 5,
    }),
    
    db.purchaseOrder.findMany({
      where: {
        userId: Number(userId),
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 5,
      include: {
        supplier: true,
      },
    }),
    
    db.transaction.findMany({
      where: {
        userId: Number(userId),
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 5,
    }),
  ]);
  
  // Check for toast message in URL
  const url = new URL(request.url);
  const toast = url.searchParams.get("toast");
  
  return json({
    user,
    recentActivities: {
      invoices: recentInvoices,
      purchaseOrders: recentPurchaseOrders,
      transactions: recentTransactions,
    },
    toast,
  });
};

export default function StaffDetail() {
  const { user, recentActivities, toast } = useLoaderData<typeof loader>();
  
  // Format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("vi-VN");
  };
  
  // Format time
  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString("vi-VN", { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };
  
  // Format currency
  const formatCurrency = (amount: number) => {
    return amount.toLocaleString("vi-VN") + " đ";
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
  
  // Translate transaction type
  const translateTransactionType = (type: string) => {
    switch (type) {
      case "INCOME":
        return "Thu";
      case "EXPENSE":
        return "Chi";
      default:
        return type;
    }
  };
  
  // Get transaction type color
  const getTransactionTypeColor = (type: string) => {
    switch (type) {
      case "INCOME":
        return "bg-green-100 text-green-800";
      case "EXPENSE":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };
  
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
        <h1 className="text-2xl font-bold">Thông tin nhân viên</h1>
        <div className="flex space-x-2">
          <Link
            to={`/admin/staff/${user.id}/edit`}
            className="bg-indigo-500 hover:bg-indigo-600 text-white px-3 py-2 rounded flex items-center gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
            </svg>
            <span>Chỉnh sửa</span>
          </Link>
          
          <Link
            to="/admin/staff"
            className="bg-gray-500 hover:bg-gray-600 text-white px-3 py-2 rounded flex items-center gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
            </svg>
            <span>Quay lại</span>
          </Link>
        </div>
      </div>
      
      {/* User Profile */}
      <div className="bg-white shadow-md rounded-md overflow-hidden mb-6">
        <div className="p-6">
          <div className="flex flex-col md:flex-row">
            <div className="flex-shrink-0 flex justify-center mb-4 md:mb-0">
              <div className="h-32 w-32 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-4xl font-medium">
                {user.fullName.charAt(0).toUpperCase()}
              </div>
            </div>
            
            <div className="flex-grow md:ml-8">
              <h2 className="text-xl font-bold mb-2">{user.fullName}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <p className="mb-2">
                    <span className="font-medium text-gray-700">Tài khoản:</span>{" "}
                    {user.username}
                  </p>
                  <p className="mb-2">
                    <span className="font-medium text-gray-700">Vai trò:</span>{" "}
                    <span className={`px-2 py-1 inline-flex text-xs leading-5 font-medium rounded-full ${
                      user.role === "ADMIN" 
                        ? "bg-purple-100 text-purple-800" 
                        : "bg-green-100 text-green-800"
                    }`}>
                      {translateRole(user.role)}
                    </span>
                  </p>
                  <p className="mb-2">
                    <span className="font-medium text-gray-700">Ngày tạo:</span>{" "}
                    {formatDate(user.createdAt)}
                  </p>
                </div>
                
                <div>
                  <p className="mb-2">
                    <span className="font-medium text-gray-700">Email:</span>{" "}
                    {user.email || "Chưa cập nhật"}
                  </p>
                  <p className="mb-2">
                    <span className="font-medium text-gray-700">Số điện thoại:</span>{" "}
                    {user.phone || "Chưa cập nhật"}
                  </p>
                  <p className="mb-2">
                    <span className="font-medium text-gray-700">Cập nhật lần cuối:</span>{" "}
                    {formatDate(user.updatedAt)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Activity Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow-md flex items-center">
          <div className="p-3 rounded-full bg-blue-100 text-blue-800 mr-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div>
            <p className="text-sm text-gray-500">Hóa đơn đã tạo</p>
            <p className="text-xl font-bold">{user._count.invoices}</p>
          </div>
        </div>
        
        <div className="bg-white p-4 rounded-lg shadow-md flex items-center">
          <div className="p-3 rounded-full bg-green-100 text-green-800 mr-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
            </svg>
          </div>
          <div>
            <p className="text-sm text-gray-500">Đơn nhập hàng</p>
            <p className="text-xl font-bold">{user._count.purchaseOrders}</p>
          </div>
        </div>
        
        <div className="bg-white p-4 rounded-lg shadow-md flex items-center">
          <div className="p-3 rounded-full bg-yellow-100 text-yellow-800 mr-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p className="text-sm text-gray-500">Giao dịch thu chi</p>
            <p className="text-xl font-bold">{user._count.transactions}</p>
          </div>
        </div>
      </div>
      
      {/* Recent Activities */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Invoices */}
        <div className="bg-white shadow-md rounded-md overflow-hidden">
          <div className="p-4 border-b border-gray-200 flex justify-between items-center">
            <h3 className="font-semibold">Hóa đơn gần đây</h3>
            <Link
              to={`/admin/invoices?search=${user.fullName}`}
              className="text-blue-500 hover:text-blue-700 text-sm"
            >
              Xem tất cả
            </Link>
          </div>
          <div className="p-4">
            {recentActivities.invoices.length > 0 ? (
              <ul className="divide-y divide-gray-200">
                {recentActivities.invoices.map((invoice) => (
                  <li key={invoice.id} className="py-3">
                    <Link
                      to={`/admin/invoices/${invoice.id}`}
                      className="block hover:bg-gray-50 -mx-4 px-4 py-2 rounded-md"
                    >
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="text-sm font-medium text-blue-600">{invoice.code}</p>
                          <p className="text-xs text-gray-500">
                            {formatDate(invoice.createdAt)} {formatTime(invoice.createdAt)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium text-gray-900">
                            {formatCurrency(invoice.finalAmount)}
                          </p>
                          <p className="text-xs text-gray-500">
                            {invoice.customerName || "Khách lẻ"}
                          </p>
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-500 py-4 text-center">
                Chưa có hóa đơn nào
              </p>
            )}
          </div>
        </div>
        
        {/* Recent Purchase Orders */}
        <div className="bg-white shadow-md rounded-md overflow-hidden">
          <div className="p-4 border-b border-gray-200 flex justify-between items-center">
            <h3 className="font-semibold">Đơn nhập hàng gần đây</h3>
            <Link
              to={`/admin/purchase-orders?search=${user.fullName}`}
              className="text-blue-500 hover:text-blue-700 text-sm"
            >
              Xem tất cả
            </Link>
          </div>
          <div className="p-4">
            {recentActivities.purchaseOrders.length > 0 ? (
              <ul className="divide-y divide-gray-200">
                {recentActivities.purchaseOrders.map((order) => (
                  <li key={order.id} className="py-3">
                    <Link
                      to={`/admin/purchase-orders/${order.id}`}
                      className="block hover:bg-gray-50 -mx-4 px-4 py-2 rounded-md"
                    >
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="text-sm font-medium text-blue-600">{order.code}</p>
                          <p className="text-xs text-gray-500">
                            {formatDate(order.createdAt)} {formatTime(order.createdAt)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium text-gray-900">
                            {formatCurrency(order.totalAmount)}
                          </p>
                          <p className="text-xs text-gray-500">
                            {order.supplier.name}
                          </p>
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-500 py-4 text-center">
                Chưa có đơn nhập hàng nào
              </p>
            )}
          </div>
        </div>
        
        {/* Recent Transactions */}
        <div className="bg-white shadow-md rounded-md overflow-hidden">
          <div className="p-4 border-b border-gray-200 flex justify-between items-center">
            <h3 className="font-semibold">Giao dịch gần đây</h3>
            <Link
              to={`/admin/transactions?search=${user.fullName}`}
              className="text-blue-500 hover:text-blue-700 text-sm"
            >
              Xem tất cả
            </Link>
          </div>
          <div className="p-4">
            {recentActivities.transactions.length > 0 ? (
              <ul className="divide-y divide-gray-200">
                {recentActivities.transactions.map((transaction) => (
                  <li key={transaction.id} className="py-3">
                    <div className="block hover:bg-gray-50 -mx-4 px-4 py-2 rounded-md">
                      <div className="flex justify-between items-center">
                        <div>
                          <div className="flex items-center">
                            <span className={`px-2 py-1 inline-flex text-xs leading-5 font-medium rounded-full mr-2 ${getTransactionTypeColor(transaction.type)}`}>
                              {translateTransactionType(transaction.type)}
                            </span>
                            <p className="text-sm font-medium text-gray-900 truncate max-w-[150px]">
                              {transaction.description}
                            </p>
                          </div>
                          <p className="text-xs text-gray-500">
                            {formatDate(transaction.date)} {formatTime(transaction.date)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className={`text-sm font-medium ${
                            transaction.type === "INCOME" 
                              ? "text-green-600" 
                              : "text-red-600"
                          }`}>
                            {transaction.type === "INCOME" ? "+" : "-"}
                            {formatCurrency(transaction.amount)}
                          </p>
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-500 py-4 text-center">
                Chưa có giao dịch nào
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
