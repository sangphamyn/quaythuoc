import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { Link, useLoaderData, useNavigation } from "@remix-run/react";
import { useState } from "react";
import { db } from "~/utils/db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const searchTerm = url.searchParams.get("search") || "";
  const statusFilter = url.searchParams.get("status") || "";
  const dateFromFilter = url.searchParams.get("dateFrom") || "";
  const dateToFilter = url.searchParams.get("dateTo") || "";
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
      { customerName: { contains: searchTerm } },
      { customerPhone: { contains: searchTerm } },
      { user: { fullName: { contains: searchTerm } } },
    ];
  }
  
  // Status filter
  if (statusFilter) {
    where.status = statusFilter;
  }
  
  // Date range filter
  if (dateFromFilter || dateToFilter) {
    where.invoiceDate = {};
    
    if (dateFromFilter) {
      where.invoiceDate.gte = new Date(dateFromFilter);
    }
    
    if (dateToFilter) {
      const dateTo = new Date(dateToFilter);
      dateTo.setHours(23, 59, 59, 999); // End of the day
      where.invoiceDate.lte = dateTo;
    }
  }
  
  // Fetch data with filters
  const [invoices, totalCount] = await Promise.all([
    db.invoice.findMany({
      where,
      orderBy: {
        invoiceDate: "desc",
      },
      include: {
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
    db.invoice.count({ where }),
  ]);

  const totalPages = Math.ceil(totalCount / limit);
  
  // Get the stats for cards
  const stats = await db.$transaction([
    // Total invoices
    db.invoice.count(),
    
    // Total revenue
    db.invoice.aggregate({
      where: {
        status: "COMPLETED",
      },
      _sum: {
        finalAmount: true,
      },
    }),
    
    // Count by status
    db.invoice.groupBy({
      by: ['status'],
      _count: {
        _all: true,
      },
    }),
    
    // Today's invoices count
    db.invoice.count({
      where: {
        invoiceDate: {
          gte: new Date(new Date().setHours(0, 0, 0, 0)),
        },
      },
    }),
    
    // Today's revenue
    db.invoice.aggregate({
      where: {
        status: "COMPLETED",
        invoiceDate: {
          gte: new Date(new Date().setHours(0, 0, 0, 0)),
        },
      },
      _sum: {
        finalAmount: true,
      },
    }),
  ]);
  
  // Prepare stats data
  const totalInvoices = stats[0];
  const totalRevenue = stats[1]._sum.finalAmount || 0;
  
  // Process status counts
  const statusCounts: Record<string, number> = {};
  stats[2].forEach(status => {
    statusCounts[status.status] = status._count._all;
  });
  
  const todayInvoices = stats[3];
  const todayRevenue = stats[4]._sum.finalAmount || 0;
  
  return json({
    invoices,
    pagination: {
      page,
      totalPages,
      totalCount,
    },
    filters: {
      searchTerm,
      statusFilter,
      dateFromFilter,
      dateToFilter,
    },
    stats: {
      totalInvoices,
      totalRevenue,
      statusCounts,
      todayInvoices,
      todayRevenue,
    },
  });
};

export default function AdminInvoices() {
  const { 
    invoices, 
    pagination, 
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
  
  // Format time
  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString("vi-VN", { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };
  
  // Translate invoice status
  const translateInvoiceStatus = (status: string) => {
    switch (status) {
      case "COMPLETED":
        return "Hoàn thành";
      case "CANCELLED":
        return "Đã hủy";
      default:
        return status;
    }
  };
  
  // Translate payment method
  const translatePaymentMethod = (method: string) => {
    switch (method) {
      case "CASH":
        return "Tiền mặt";
      case "TRANSFER":
        return "Chuyển khoản";
      case "CREDIT":
        return "Công nợ";
      default:
        return method;
    }
  };
  
  // Get status color class
  const getStatusColorClass = (status: string) => {
    switch (status) {
      case "COMPLETED":
        return "bg-green-100 text-green-800";
      case "CANCELLED":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };
  
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Quản lý hóa đơn</h1>
        <Link
          to="/admin/invoices/new"
          className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-2 rounded flex items-center gap-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
          </svg>
          <span>Tạo hóa đơn mới</span>
        </Link>
      </div>
      
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow-md">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Tổng số hóa đơn</p>
              <p className="text-2xl font-bold">{stats.totalInvoices}</p>
            </div>
            <div className="p-3 rounded-full bg-blue-100 text-blue-800">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
          </div>
          <div className="mt-2 text-sm text-gray-500">
            {stats.todayInvoices} hóa đơn hôm nay
          </div>
        </div>
        
        <div className="bg-white p-4 rounded-lg shadow-md">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Tổng doanh thu</p>
              <p className="text-2xl font-bold">{formatCurrency(stats.totalRevenue)}</p>
            </div>
            <div className="p-3 rounded-full bg-green-100 text-green-800">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <div className="mt-2 text-sm text-gray-500">
            {formatCurrency(stats.todayRevenue)} doanh thu hôm nay
          </div>
        </div>
        
        <div className="bg-white p-4 rounded-lg shadow-md">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Hóa đơn hoàn thành</p>
              <p className="text-2xl font-bold">{stats.statusCounts["COMPLETED"] || 0}</p>
            </div>
            <div className="p-3 rounded-full bg-green-100 text-green-800">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <div className="mt-2 text-sm text-gray-500">
            Tổng hóa đơn thành công
          </div>
        </div>
        
        <div className="bg-white p-4 rounded-lg shadow-md">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Hóa đơn đã hủy</p>
              <p className="text-2xl font-bold">{stats.statusCounts["CANCELLED"] || 0}</p>
            </div>
            <div className="p-3 rounded-full bg-red-100 text-red-800">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
          </div>
          <div className="mt-2 text-sm text-gray-500">
            Tổng hóa đơn đã hủy
          </div>
        </div>
      </div>
      
      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow-md mb-6">
        <form method="get" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label htmlFor="search" className="block text-sm font-medium text-gray-700 mb-1">
              Tìm kiếm
            </label>
            <input
              type="text"
              id="search"
              name="search"
              defaultValue={filters.searchTerm}
              placeholder="Mã hóa đơn, khách hàng..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>
          
          <div>
            <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-1">
              Trạng thái
            </label>
            <select
              id="status"
              name="status"
              defaultValue={filters.statusFilter}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="">Tất cả trạng thái</option>
              <option value="COMPLETED">Hoàn thành</option>
              <option value="CANCELLED">Đã hủy</option>
            </select>
          </div>
          
          <div>
            <label htmlFor="dateFrom" className="block text-sm font-medium text-gray-700 mb-1">
              Từ ngày
            </label>
            <input
              type="date"
              id="dateFrom"
              name="dateFrom"
              defaultValue={filters.dateFromFilter}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>
          
          <div>
            <label htmlFor="dateTo" className="block text-sm font-medium text-gray-700 mb-1">
              Đến ngày
            </label>
            <input
              type="date"
              id="dateTo"
              name="dateTo"
              defaultValue={filters.dateToFilter}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>
          
          <div className="md:col-span-2 lg:col-span-4 flex justify-end">
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
      
      {/* Invoices Table */}
      <div className="bg-white shadow-md rounded-md overflow-hidden mb-6">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Mã hóa đơn
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Thời gian
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Khách hàng
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Nhân viên
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Tổng tiền
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Thanh toán
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Trạng thái
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Sản phẩm
                </th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Thao tác
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {invoices.map((invoice) => (
                <tr key={invoice.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-blue-600">
                    <Link to={`/admin/invoices/${invoice.id}`}>
                      {invoice.code}
                    </Link>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <div>{formatDate(invoice.invoiceDate)}</div>
                    <div className="text-xs">{formatTime(invoice.invoiceDate)}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {invoice.customerName ? (
                      <>
                        <div className="text-sm font-medium text-gray-900">{invoice.customerName}</div>
                        {invoice.customerPhone && (
                          <div className="text-xs text-gray-500">{invoice.customerPhone}</div>
                        )}
                      </>
                    ) : (
                      <span className="text-sm text-gray-500">Khách lẻ</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {invoice.user.fullName}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {formatCurrency(invoice.finalAmount)}
                    </div>
                    {invoice.discount > 0 && (
                      <div className="text-xs text-gray-500">
                        Giảm giá: {formatCurrency(invoice.discount)}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {translatePaymentMethod(invoice.paymentMethod)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 inline-flex text-xs leading-5 font-medium rounded-full ${getStatusColorClass(invoice.status)}`}>
                      {translateInvoiceStatus(invoice.status)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {invoice._count.items}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex justify-end space-x-3">
                      <Link
                        to={`/admin/invoices/${invoice.id}`}
                        className="text-blue-600 hover:text-blue-900"
                        title="Chi tiết"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                          <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                        </svg>
                      </Link>
                      
                      <Link
                        to={`/admin/invoices/${invoice.id}/print`}
                        className="text-gray-600 hover:text-gray-900"
                        title="In hóa đơn"
                        target="_blank"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v3a2 2 0 002 2h1v2a2 2 0 002 2h6a2 2 0 002-2v-2h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a2 2 0 00-2-2H7a2 2 0 00-2 2zm8 0H7v3h6V4zm0 8H7v4h6v-4z" clipRule="evenodd" />
                        </svg>
                      </Link>
                      
                      {invoice.status === "COMPLETED" && (
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm("Bạn có chắc chắn muốn hủy hóa đơn này không?")) {
                              // Submit form to cancel invoice
                              const form = document.createElement("form");
                              form.method = "post";
                              form.action = `/admin/invoices/${invoice.id}/cancel`;
                              document.body.appendChild(form);
                              form.submit();
                            }
                          }}
                          className="text-red-600 hover:text-red-900"
                          title="Hủy hóa đơn"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              
              {invoices.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-6 py-4 text-center text-sm text-gray-500">
                    Không tìm thấy hóa đơn nào
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
            Hiển thị {((pagination.page - 1) * 10) + 1} đến {Math.min(pagination.page * 10, pagination.totalCount)} trong số {pagination.totalCount} hóa đơn
          </div>
          <div className="flex space-x-1">
            {pagination.page > 1 && (
              <Link
                to={`/admin/invoices?page=${pagination.page - 1}${filters.searchTerm ? `&search=${filters.searchTerm}` : ''}${filters.statusFilter ? `&status=${filters.statusFilter}` : ''}${filters.dateFromFilter ? `&dateFrom=${filters.dateFromFilter}` : ''}${filters.dateToFilter ? `&dateTo=${filters.dateToFilter}` : ''}`}
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
                    to={`/admin/invoices?page=${pageNum}${filters.searchTerm ? `&search=${filters.searchTerm}` : ''}${filters.statusFilter ? `&status=${filters.statusFilter}` : ''}${filters.dateFromFilter ? `&dateFrom=${filters.dateFromFilter}` : ''}${filters.dateToFilter ? `&dateTo=${filters.dateToFilter}` : ''}`}
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
                to={`/admin/invoices?page=${pagination.page + 1}${filters.searchTerm ? `&search=${filters.searchTerm}` : ''}${filters.statusFilter ? `&status=${filters.statusFilter}` : ''}${filters.dateFromFilter ? `&dateFrom=${filters.dateFromFilter}` : ''}${filters.dateToFilter ? `&dateTo=${filters.dateToFilter}` : ''}`}
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
