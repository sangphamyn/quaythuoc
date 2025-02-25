import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { Link, useLoaderData, useNavigation } from "@remix-run/react";
import { useState } from "react";
import { db } from "~/utils/db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const searchTerm = url.searchParams.get("search") || "";
  const supplierId = url.searchParams.get("supplierId") || "";
  const statusFilter = url.searchParams.get("status") || "";
  const pageParam = url.searchParams.get("page") || "1";
  const page = parseInt(pageParam, 10);
  const limit = 10;
  const skip = (page - 1) * limit;

  // Build the where clause
  const where: any = {};
  
  // Search condition
  if (searchTerm) {
    where.OR = [
      { code: { contains: searchTerm } },
      { supplier: { name: { contains: searchTerm } } },
    ];
  }
  
  // Supplier filter
  if (supplierId && !isNaN(Number(supplierId))) {
    where.supplierId = Number(supplierId);
  }
  
  // Status filter
  if (statusFilter) {
    where.paymentStatus = statusFilter;
  }
  
  // Fetch data with filters
  const [purchaseOrders, totalCount, suppliers] = await Promise.all([
    db.purchaseOrder.findMany({
      where,
      orderBy: {
        orderDate: "desc",
      },
      include: {
        supplier: true,
        user: true,
        _count: {
          select: {
            items: true,
          },
        },
      },
      skip,
      take: limit,
    }),
    db.purchaseOrder.count({ where }),
    db.supplier.findMany({
      orderBy: {
        name: "asc",
      },
      take: 100,
    }),
  ]);

  const totalPages = Math.ceil(totalCount / limit);
  
  // Get the stats for cards
  const stats = await db.$transaction([
    // Total purchase orders
    db.purchaseOrder.count(),
    
    // Total amount
    db.purchaseOrder.aggregate({
      _sum: {
        totalAmount: true,
      },
    }),
    
    // Count by status
    db.purchaseOrder.groupBy({
      by: ['paymentStatus'],
      _count: {
        _all: true,
      },
    }),
    
    // Recent orders (today)
    db.purchaseOrder.count({
      where: {
        orderDate: {
          gte: new Date(new Date().setHours(0, 0, 0, 0)),
        },
      },
    }),
  ]);
  
  // Prepare stats data
  const totalPurchaseOrders = stats[0];
  const totalAmount = stats[1]._sum.totalAmount || 0;
  
  // Process status counts
  const statusCounts: Record<string, number> = {};
  stats[2].forEach(status => {
    statusCounts[status.paymentStatus] = status._count._all;
  });
  
  const todayOrders = stats[3];
  
  return json({
    purchaseOrders,
    pagination: {
      page,
      totalPages,
      totalCount,
    },
    suppliers,
    filters: {
      searchTerm,
      supplierId,
      statusFilter,
    },
    stats: {
      totalPurchaseOrders,
      totalAmount,
      statusCounts,
      todayOrders,
    },
  });
};

export default function AdminPurchaseOrders() {
  const { 
    purchaseOrders, 
    pagination, 
    suppliers, 
    filters,
    stats 
  } = useLoaderData<typeof loader>();
  
  const navigation = useNavigation();
  const isLoading = navigation.state === "loading";
  
  // Format currency
  const formatCurrency = (amount: number) => {
    return amount.toLocaleString("vi-VN") + " đ";
  };
  
  // Format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("vi-VN");
  };
  
  // Translate payment status
  const translatePaymentStatus = (status: string) => {
    switch (status) {
      case "PAID":
        return "Đã thanh toán";
      case "PARTIAL":
        return "Thanh toán một phần";
      case "UNPAID":
        return "Chưa thanh toán";
      default:
        return status;
    }
  };
  
  // Get status color class
  const getStatusColorClass = (status: string) => {
    switch (status) {
      case "PAID":
        return "bg-green-100 text-green-800";
      case "PARTIAL":
        return "bg-yellow-100 text-yellow-800";
      case "UNPAID":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };
  
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Quản lý nhập hàng</h1>
        <Link
          to="/admin/purchase-orders/new"
          className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-2 rounded flex items-center gap-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
          </svg>
          <span>Tạo đơn nhập hàng</span>
        </Link>
      </div>
      
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow-md">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Tổng số đơn nhập</p>
              <p className="text-2xl font-bold">{stats.totalPurchaseOrders}</p>
            </div>
            <div className="p-3 rounded-full bg-blue-100 text-blue-800">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
          </div>
          <div className="mt-2 text-sm text-gray-500">
            {stats.todayOrders} đơn mới hôm nay
          </div>
        </div>
        
        <div className="bg-white p-4 rounded-lg shadow-md">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Tổng giá trị</p>
              <p className="text-2xl font-bold">{formatCurrency(stats.totalAmount)}</p>
            </div>
            <div className="p-3 rounded-full bg-green-100 text-green-800">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <div className="mt-2 text-sm text-gray-500">
            Giá trị nhập hàng tích lũy
          </div>
        </div>
        
        <div className="bg-white p-4 rounded-lg shadow-md">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Đã thanh toán</p>
              <p className="text-2xl font-bold">{stats.statusCounts["PAID"] || 0}</p>
            </div>
            <div className="p-3 rounded-full bg-green-100 text-green-800">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <div className="mt-2 text-sm text-gray-500">
            {stats.statusCounts["PARTIAL"] || 0} đơn thanh toán một phần
          </div>
        </div>
        
        <div className="bg-white p-4 rounded-lg shadow-md">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Chưa thanh toán</p>
              <p className="text-2xl font-bold">{stats.statusCounts["UNPAID"] || 0}</p>
            </div>
            <div className="p-3 rounded-full bg-red-100 text-red-800">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <div className="mt-2 text-sm text-gray-500">
            Cần xử lý thanh toán
          </div>
        </div>
      </div>
      
      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow-md mb-6">
        <form method="get" className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label htmlFor="search" className="block text-sm font-medium text-gray-700 mb-1">
              Tìm kiếm
            </label>
            <input
              type="text"
              id="search"
              name="search"
              defaultValue={filters.searchTerm}
              placeholder="Mã đơn hoặc nhà cung cấp..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>
          
          <div>
            <label htmlFor="supplierId" className="block text-sm font-medium text-gray-700 mb-1">
              Nhà cung cấp
            </label>
            <select
              id="supplierId"
              name="supplierId"
              defaultValue={filters.supplierId}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="">Tất cả nhà cung cấp</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </div>
          
          <div>
            <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-1">
              Trạng thái thanh toán
            </label>
            <select
              id="status"
              name="status"
              defaultValue={filters.statusFilter}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="">Tất cả trạng thái</option>
              <option value="PAID">Đã thanh toán</option>
              <option value="PARTIAL">Thanh toán một phần</option>
              <option value="UNPAID">Chưa thanh toán</option>
            </select>
          </div>
          
          <div className="md:col-span-3 flex justify-end">
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
        </form>
      </div>
      
      {/* Purchase Orders Table */}
      <div className="bg-white shadow-md rounded-md overflow-hidden mb-6">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Mã đơn
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Ngày nhập
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Nhà cung cấp
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Nhân viên
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Tổng tiền
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Trạng thái
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Số lượng SP
                </th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Thao tác
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {purchaseOrders.map((order) => (
                <tr key={order.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-blue-600">
                    <Link to={`/admin/purchase-orders/${order.id}`}>
                      {order.code}
                    </Link>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDate(order.orderDate)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    <Link to={`/admin/suppliers/${order.supplierId}`} className="hover:underline">
                      {order.supplier.name}
                    </Link>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {order.user.fullName}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {formatCurrency(order.totalAmount)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 inline-flex text-xs leading-5 font-medium rounded-full ${getStatusColorClass(order.paymentStatus)}`}>
                      {translatePaymentStatus(order.paymentStatus)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {order._count.items}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex justify-end space-x-3">
                      <Link
                        to={`/admin/purchase-orders/${order.id}`}
                        className="text-blue-600 hover:text-blue-900"
                        title="Chi tiết"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                          <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                        </svg>
                      </Link>
                      <Link
                        to={`/admin/purchase-orders/${order.id}/edit`}
                        className="text-indigo-600 hover:text-indigo-900"
                        title="Sửa"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                        </svg>
                      </Link>
                      {order.paymentStatus === "UNPAID" && (
                        <Link
                          to={`/admin/purchase-orders/${order.id}/payment`}
                          className="text-green-600 hover:text-green-900"
                          title="Thanh toán"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h8a2 2 0 012 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4zm6 4a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                          </svg>
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {purchaseOrders.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-4 text-center text-sm text-gray-500">
                    Không tìm thấy đơn nhập hàng nào
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
            Hiển thị {((pagination.page - 1) * 10) + 1} đến {Math.min(pagination.page * 10, pagination.totalCount)} trong số {pagination.totalCount} đơn nhập hàng
          </div>
          <div className="flex space-x-1">
            {pagination.page > 1 && (
              <Link
                to={`/admin/purchase-orders?page=${pagination.page - 1}${filters.searchTerm ? `&search=${filters.searchTerm}` : ''}${filters.supplierId ? `&supplierId=${filters.supplierId}` : ''}${filters.statusFilter ? `&status=${filters.statusFilter}` : ''}`}
                className="px-3 py-1 border rounded hover:bg-gray-100 flex items-center"
                title="Trang trước"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </Link>
            )}
            {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map((pageNum) => (
              <Link
                key={pageNum}
                to={`/admin/purchase-orders?page=${pageNum}${filters.searchTerm ? `&search=${filters.searchTerm}` : ''}${filters.supplierId ? `&supplierId=${filters.supplierId}` : ''}${filters.statusFilter ? `&status=${filters.statusFilter}` : ''}`}
                className={`px-3 py-1 border rounded ${
                  pageNum === pagination.page
                    ? 'bg-blue-500 text-white'
                    : 'hover:bg-gray-100'
                }`}
              >
                {pageNum}
              </Link>
            ))}
            {pagination.page < pagination.totalPages && (
              <Link
                to={`/admin/purchase-orders?page=${pagination.page + 1}${filters.searchTerm ? `&search=${filters.searchTerm}` : ''}${filters.supplierId ? `&supplierId=${filters.supplierId}` : ''}${filters.statusFilter ? `&status=${filters.statusFilter}` : ''}`}
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
