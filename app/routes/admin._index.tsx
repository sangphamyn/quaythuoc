import { useState } from "react";
import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import { requireAdmin } from "~/utils/session.server";
import { db } from "~/utils/db.server";

type Stats = {
  totalProducts: number;
  totalCategories: number;
  totalCabinets: number;
  lowStockProducts: number;
  expiringSoonProducts: number;
  todayInvoices: number;
  todayRevenue: number;
  pendingPurchaseOrders: number;
};

type LoaderData = {
  stats: Stats;
  recentInvoices: {
    id: number;
    code: string;
    customerName: string | null;
    finalAmount: number;
    createdAt: string;
  }[];
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Kiểm tra quyền admin
  await requireAdmin(request);

  // Lấy thống kê tổng quan
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [
    totalProducts,
    totalCategories,
    totalCabinets,
    todayInvoices,
    pendingPurchaseOrders,
    recentInvoices
  ] = await Promise.all([
    db.product.count(),
    db.category.count(),
    db.cabinet.count(),
    db.invoice.count({
      where: {
        createdAt: {
          gte: today
        },
        status: "COMPLETED"
      }
    }),
    db.purchaseOrder.count({
      where: {
        paymentStatus: "UNPAID"
      }
    }),
    db.invoice.findMany({
      where: {
        status: "COMPLETED"
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 5,
      select: {
        id: true,
        code: true,
        customerName: true,
        finalAmount: true,
        createdAt: true
      }
    })
  ]);
  
  // Tính tổng doanh thu hôm nay
  const todayRevenue = await db.invoice.aggregate({
    where: {
      createdAt: {
        gte: today
      },
      status: "COMPLETED"
    },
    _sum: {
      finalAmount: true
    }
  });

  // Lấy số sản phẩm sắp hết hàng (dưới 10 đơn vị)
  const lowStockProducts = await db.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(DISTINCT productId) as count
    FROM Inventory
    WHERE quantity < 10
  `;

  // Lấy số sản phẩm sắp hết hạn (trong vòng 30 ngày)
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
  
  const expiringSoonProducts = await db.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(DISTINCT productId) as count
    FROM Inventory 
    WHERE expiryDate >= ${today} AND expiryDate <= ${thirtyDaysFromNow}
  `;

  const stats: Stats = {
    totalProducts,
    totalCategories,
    totalCabinets,
    lowStockProducts: Number(lowStockProducts[0]?.count || 0),
    expiringSoonProducts: Number(expiringSoonProducts[0]?.count || 0),
    todayInvoices,
    todayRevenue: todayRevenue._sum.finalAmount || 0,
    pendingPurchaseOrders
  };

  return json<LoaderData>({ 
    stats,
    recentInvoices: recentInvoices.map(invoice => ({
      ...invoice,
      createdAt: invoice.createdAt.toISOString()
    }))
  });
};

export default function AdminDashboard() {
  const { stats, recentInvoices } = useLoaderData<typeof loader>();

  // Hàm định dạng số tiền
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
  };

  // Hàm định dạng ngày tháng
  const formatDate = (dateString: string) => {
    const options: Intl.DateTimeFormatOptions = { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    };
    return new Date(dateString).toLocaleDateString('vi-VN', options);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Tổng quan hệ thống</h1>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {/* Thẻ thống kê */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center">
            <div className="bg-blue-100 p-3 rounded-full">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
            <div className="ml-4">
              <h2 className="text-sm font-medium text-gray-500">Tổng sản phẩm</h2>
              <p className="text-2xl font-semibold text-gray-800">{stats.totalProducts}</p>
            </div>
          </div>
          <div className="mt-4">
            <Link to="/admin/products" className="text-sm text-blue-600 hover:text-blue-800">
              Xem chi tiết →
            </Link>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center">
            <div className="bg-green-100 p-3 rounded-full">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <div className="ml-4">
              <h2 className="text-sm font-medium text-gray-500">Doanh thu hôm nay</h2>
              <p className="text-2xl font-semibold text-gray-800">{formatCurrency(stats.todayRevenue)}</p>
            </div>
          </div>
          <div className="mt-4">
            <Link to="/admin/reports" className="text-sm text-green-600 hover:text-green-800">
              Xem báo cáo →
            </Link>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center">
            <div className="bg-yellow-100 p-3 rounded-full">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div className="ml-4">
              <h2 className="text-sm font-medium text-gray-500">Sắp hết hàng</h2>
              <p className="text-2xl font-semibold text-gray-800">{stats.lowStockProducts}</p>
            </div>
          </div>
          <div className="mt-4">
            <Link to="/admin/products?filter=low-stock" className="text-sm text-yellow-600 hover:text-yellow-800">
              Kiểm tra ngay →
            </Link>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center">
            <div className="bg-red-100 p-3 rounded-full">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="ml-4">
              <h2 className="text-sm font-medium text-gray-500">Sắp hết hạn</h2>
              <p className="text-2xl font-semibold text-gray-800">{stats.expiringSoonProducts}</p>
            </div>
          </div>
          <div className="mt-4">
            <Link to="/admin/products?filter=expiring-soon" className="text-sm text-red-600 hover:text-red-800">
              Kiểm tra ngay →
            </Link>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Hóa đơn gần đây */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="px-6 py-4 border-b">
              <h2 className="text-lg font-semibold text-gray-800">Hóa đơn gần đây</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Mã hóa đơn
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Khách hàng
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Thời gian
                    </th>
                    <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Tổng tiền
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {recentInvoices.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-4 text-center text-sm text-gray-500">
                        Chưa có hóa đơn nào.
                      </td>
                    </tr>
                  ) : (
                    recentInvoices.map((invoice) => (
                      <tr key={invoice.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-indigo-600">
                          <Link to={`/admin/invoices/${invoice.id}`}>
                            {invoice.code}
                          </Link>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {invoice.customerName || <span className="text-gray-400 italic">Khách lẻ</span>}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {formatDate(invoice.createdAt)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-gray-900">
                          {formatCurrency(invoice.finalAmount)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="px-6 py-4 border-t">
              <Link to="/admin/invoices" className="text-sm text-indigo-600 hover:text-indigo-800">
                Xem tất cả hóa đơn →
              </Link>
            </div>
          </div>
        </div>

        {/* Thông tin nhanh */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="px-6 py-4 border-b">
              <h2 className="text-lg font-semibold text-gray-800">Thông tin hệ thống</h2>
            </div>
            <div className="p-6 space-y-6">
              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-2">Tổng quan kho hàng</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <p className="text-sm text-gray-500">Tủ hàng</p>
                    <p className="text-xl font-semibold">{stats.totalCabinets}</p>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <p className="text-sm text-gray-500">Danh mục</p>
                    <p className="text-xl font-semibold">{stats.totalCategories}</p>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-2">Hoạt động hôm nay</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <p className="text-sm text-gray-500">Đơn hàng</p>
                    <p className="text-xl font-semibold">{stats.todayInvoices}</p>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <p className="text-sm text-gray-500">Nhập chưa thanh toán</p>
                    <p className="text-xl font-semibold">{stats.pendingPurchaseOrders}</p>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-sm font-medium text-gray-500">Phím tắt</h3>
                </div>
                <div className="space-y-2">
                  <Link 
                    to="/admin/invoices/new" 
                    className="flex items-center p-3 bg-gray-50 hover:bg-gray-100 rounded-lg text-sm"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-indigo-500 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Tạo hóa đơn mới
                  </Link>
                  <Link 
                    to="/admin/purchases/new" 
                    className="flex items-center p-3 bg-gray-50 hover:bg-gray-100 rounded-lg text-sm"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-indigo-500 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                    Tạo phiếu nhập mới
                  </Link>
                  <Link 
                    to="/admin/products/new" 
                    className="flex items-center p-3 bg-gray-50 hover:bg-gray-100 rounded-lg text-sm"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-indigo-500 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Thêm sản phẩm mới
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
