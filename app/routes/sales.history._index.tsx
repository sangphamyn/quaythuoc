import { LoaderFunctionArgs, json, redirect } from "@remix-run/node";
import { useLoaderData, Link, useSearchParams } from "@remix-run/react";
import { getUserSession } from "~/utils/session.server";
import { db } from "~/utils/db.server";
import {
  EyeIcon,
  PrinterIcon,
  MagnifyingGlassIcon,
  CalendarDaysIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@heroicons/react/24/outline";
import { useState } from "react";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const user = await getUserSession(request);
  
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = 20;
  const skip = (page - 1) * limit;
  
  const startDate = url.searchParams.get("startDate") || undefined;
  const endDate = url.searchParams.get("endDate") || undefined;
  const query = url.searchParams.get("q") || undefined;
  
  // Build the where clause based on filter params
  const where: any = {
    userId: Number(user.get("userId")),
    status: "COMPLETED",
  };
  
  if (startDate && endDate) {
    where.invoiceDate = {
      gte: new Date(startDate),
      lte: new Date(endDate),
    };
  } else if (startDate) {
    where.invoiceDate = {
      gte: new Date(startDate),
    };
  } else if (endDate) {
    where.invoiceDate = {
      lte: new Date(endDate),
    };
  }
  
  if (query) {
    where.OR = [
      { code: { contains: query } },
      { customerName: { contains: query } },
      { customerPhone: { contains: query } },
    ];
  }
  
  // Get invoices based on filters with pagination
  const invoices = await db.invoice.findMany({
    where,
    orderBy: {
      invoiceDate: "desc",
    },
    include: {
      items: {
        include: {
          product: true,
        },
      },
    },
    skip,
    take: limit,
  });

  // Get total count for pagination
  const totalInvoices = await db.invoice.count({ where });
  const totalPages = Math.ceil(totalInvoices / limit);
  
  // Get summary statistics
  const invoiceSummary = await db.invoice.aggregate({
    where,
    _sum: {
      finalAmount: true,
    },
    _count: true,
  });

  return json({
    invoices,
    pagination: {
      currentPage: page,
      totalPages,
      totalItems: totalInvoices,
    },
    summary: {
      totalAmount: invoiceSummary._sum.finalAmount || 0,
      totalInvoices: invoiceSummary._count,
    },
    user,
  });
};

export default function SalesHistory() {
  const { invoices, pagination, summary, user } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  
  const [searchTerm, setSearchTerm] = useState(searchParams.get("q") || "");
  const [startDate, setStartDate] = useState(searchParams.get("startDate") || "");
  const [endDate, setEndDate] = useState(searchParams.get("endDate") || "");
  
  // Get current date in YYYY-MM-DD format for max date input
  const today = new Date().toISOString().split("T")[0];
  
  // Function to format dates for display
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };
  
  // Function to get payment method text
  const getPaymentMethodText = (method: string) => {
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
  
  // Handle search form submission
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const newParams = new URLSearchParams();
    if (searchTerm) newParams.set("q", searchTerm);
    if (startDate) newParams.set("startDate", startDate);
    if (endDate) newParams.set("endDate", endDate);
    newParams.set("page", "1"); // Reset to page 1 on new search
    setSearchParams(newParams);
  };
  
  // Function to handle pagination
  const goToPage = (page: number) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set("page", page.toString());
    setSearchParams(newParams);
  };

  return (
    <div className="container mx-auto p-4">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-200">
          <h1 className="text-xl font-bold text-gray-900">Lịch sử bán hàng</h1>
          <p className="text-sm text-gray-500 mt-1">
            Danh sách các hóa đơn bạn đã tạo
          </p>
        </div>

        {/* Stats */}
        <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4 bg-blue-50 border-b border-blue-100">
          <div className="bg-white rounded-lg shadow-sm p-4 border border-gray-200">
            <div className="text-sm text-gray-500 mb-1">Tổng số hóa đơn</div>
            <div className="text-2xl font-bold">{summary.totalInvoices}</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-4 border border-gray-200">
            <div className="text-sm text-gray-500 mb-1">Tổng doanh thu</div>
            <div className="text-2xl font-bold text-blue-600">
              {summary.totalAmount.toLocaleString("vi-VN")} đ
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-4 border border-gray-200">
            <div className="text-sm text-gray-500 mb-1">Doanh thu trung bình/hóa đơn</div>
            <div className="text-2xl font-bold text-green-600">
              {summary.totalInvoices > 0
                ? (summary.totalAmount / summary.totalInvoices).toLocaleString("vi-VN")
                : 0}{" "}
              đ
            </div>
          </div>
        </div>

        {/* Search and Filter */}
        <div className="p-4 border-b border-gray-200">
          <form onSubmit={handleSearch} className="space-y-3">
            <div className="flex flex-col md:flex-row md:space-x-4 space-y-3 md:space-y-0">
              <div className="flex-1">
                <label htmlFor="search" className="block text-xs font-medium text-gray-700 mb-1">
                  Tìm kiếm
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    id="search"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Tìm theo mã, tên khách hàng, SĐT..."
                    className="pl-10 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm h-10"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="startDate" className="block text-xs font-medium text-gray-700 mb-1">
                  Từ ngày
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <CalendarDaysIcon className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="date"
                    id="startDate"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    max={endDate || today}
                    className="pl-10 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm h-10"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="endDate" className="block text-xs font-medium text-gray-700 mb-1">
                  Đến ngày
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <CalendarDaysIcon className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="date"
                    id="endDate"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    min={startDate}
                    max={today}
                    className="pl-10 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm h-10"
                  />
                </div>
              </div>
              <div className="flex items-end">
                <button
                  type="submit"
                  className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 h-10"
                >
                  Tìm kiếm
                </button>
              </div>
            </div>
          </form>
        </div>

        {/* Invoice List */}
        <div className="overflow-x-auto">
          {invoices.length > 0 ? (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Mã hóa đơn
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Ngày
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Khách hàng
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Sản phẩm
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Thanh toán
                  </th>
                  <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tổng tiền
                  </th>
                  <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Thao tác
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {invoices.map((invoice: any) => (
                  <tr key={invoice.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-blue-600">{invoice.code}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{formatDate(invoice.invoiceDate)}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{invoice.customerName || "Khách lẻ"}</div>
                      {invoice.customerPhone && (
                        <div className="text-sm text-gray-500">{invoice.customerPhone}</div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">{invoice.items.length} sản phẩm</div>
                      <div className="text-xs text-gray-500 truncate max-w-[250px]">
                        {invoice.items.map((item: any) => item.product.name).join(", ")}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        invoice.paymentMethod === "CASH" 
                          ? "bg-green-100 text-green-800" 
                          : invoice.paymentMethod === "TRANSFER"
                            ? "bg-blue-100 text-blue-800"
                            : "bg-orange-100 text-orange-800"
                      }`}>
                        {getPaymentMethodText(invoice.paymentMethod)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="text-sm font-medium text-gray-900">
                        {invoice.finalAmount.toLocaleString("vi-VN")} đ
                      </div>
                      {invoice.discount > 0 && (
                        <div className="text-xs text-gray-500">
                          Giảm: {invoice.discount.toLocaleString("vi-VN")} đ
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <div className="flex justify-center space-x-2">
                        <Link
                          to={`/sales/invoices/${invoice.id}`}
                          className="text-blue-600 hover:text-blue-900"
                          title="Xem chi tiết"
                        >
                          <EyeIcon className="h-5 w-5" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="text-center py-10 text-gray-500">
              Không tìm thấy hóa đơn nào phù hợp với điều kiện tìm kiếm
            </div>
          )}
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
            <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-gray-700">
                  Hiển thị <span className="font-medium">{Math.min((pagination.currentPage - 1) * 20 + 1, pagination.totalItems)}</span>{" "}
                  đến <span className="font-medium">{Math.min(pagination.currentPage * 20, pagination.totalItems)}</span>{" "}
                  trong số <span className="font-medium">{pagination.totalItems}</span> hóa đơn
                </p>
              </div>
              <div>
                <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                  {/* Previous Page Button */}
                  <button
                    onClick={() => goToPage(pagination.currentPage - 1)}
                    disabled={pagination.currentPage <= 1}
                    className={`relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium ${
                      pagination.currentPage <= 1
                        ? "text-gray-300 cursor-not-allowed"
                        : "text-gray-500 hover:bg-gray-50"
                    }`}
                  >
                    <span className="sr-only">Previous</span>
                    <ChevronLeftIcon className="h-5 w-5" aria-hidden="true" />
                  </button>
                  
                  {/* Page Numbers */}
                  {Array.from({ length: pagination.totalPages }, (_, i) => i + 1)
                    .filter(page => 
                      page === 1 || 
                      page === pagination.totalPages || 
                      Math.abs(page - pagination.currentPage) <= 1
                    )
                    .reduce((acc: React.ReactNode[], page, i, filtered) => {
                      if (i > 0 && filtered[i - 1] !== page - 1) {
                        acc.push(
                          <span key={`ellipsis-${page}`} className="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700">
                            ...
                          </span>
                        );
                      }
                      
                      acc.push(
                        <button
                          key={page}
                          onClick={() => goToPage(page)}
                          className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                            page === pagination.currentPage
                              ? "z-10 bg-blue-50 border-blue-500 text-blue-600"
                              : "bg-white border-gray-300 text-gray-500 hover:bg-gray-50"
                          }`}
                        >
                          {page}
                        </button>
                      );
                      
                      return acc;
                    }, [])
                  }
                  
                  {/* Next Page Button */}
                  <button
                    onClick={() => goToPage(pagination.currentPage + 1)}
                    disabled={pagination.currentPage >= pagination.totalPages}
                    className={`relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium ${
                      pagination.currentPage >= pagination.totalPages
                        ? "text-gray-300 cursor-not-allowed"
                        : "text-gray-500 hover:bg-gray-50"
                    }`}
                  >
                    <span className="sr-only">Next</span>
                    <ChevronRightIcon className="h-5 w-5" aria-hidden="true" />
                  </button>
                </nav>
              </div>
            </div>
            
            {/* Mobile Pagination */}
            <div className="flex sm:hidden justify-between items-center">
              <button
                onClick={() => goToPage(pagination.currentPage - 1)}
                disabled={pagination.currentPage <= 1}
                className={`relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md ${
                  pagination.currentPage <= 1
                    ? "text-gray-300 bg-gray-50 cursor-not-allowed"
                    : "text-gray-700 bg-white hover:bg-gray-50"
                }`}
              >
                <ChevronLeftIcon className="h-5 w-5 mr-1" />
                Trước
              </button>
              <div className="text-sm text-gray-700">
                Trang <span className="font-medium">{pagination.currentPage}</span> / <span className="font-medium">{pagination.totalPages}</span>
              </div>
              <button
                onClick={() => goToPage(pagination.currentPage + 1)}
                disabled={pagination.currentPage >= pagination.totalPages}
                className={`relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md ${
                  pagination.currentPage >= pagination.totalPages
                    ? "text-gray-300 bg-gray-50 cursor-not-allowed"
                    : "text-gray-700 bg-white hover:bg-gray-50"
                }`}
              >
                Sau
                <ChevronRightIcon className="h-5 w-5 ml-1" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
