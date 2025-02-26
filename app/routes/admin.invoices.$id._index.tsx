import { json, redirect, type LoaderFunctionArgs } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import { db } from "~/utils/db.server";

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
  const invoiceId = params.id;
  
  if (!invoiceId || isNaN(Number(invoiceId))) {
    throw json({ message: "Mã hóa đơn không hợp lệ" }, { status: 400 });
  }
  
  const invoice = await db.invoice.findUnique({
    where: {
      id: Number(invoiceId),
    },
    include: {
      user: true,
      items: {
        include: {
          product: true,
          productUnit: {
            include: {
              unit: true,
            },
          },
        },
      },
      transactions: true,
    },
  });
  
  if (!invoice) {
    throw json({ message: "Không tìm thấy hóa đơn" }, { status: 404 });
  }
  
  // Check for toast message in URL
  const url = new URL(request.url);
  const toast = url.searchParams.get("toast");
  
  return json({
    invoice,
    toast,
  });
};

export default function InvoiceDetail() {
  const { invoice, toast } = useLoaderData<typeof loader>();
  
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
      {/* Toast notification */}
      {toast && (
        <div className="bg-green-100 border-l-4 border-green-500 text-green-700 p-4 mb-6">
          <p>{toast}</p>
        </div>
      )}
      
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Chi tiết hóa đơn</h1>
        <div className="flex space-x-3">
          <Link
            to={`/admin/invoices/${invoice.id}/print`}
            className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-2 rounded flex items-center gap-2"
            target="_blank"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v3a2 2 0 002 2h1v2a2 2 0 002 2h6a2 2 0 002-2v-2h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a2 2 0 00-2-2H7a2 2 0 00-2 2zm8 0H7v3h6V4zm0 8H7v4h6v-4z" clipRule="evenodd" />
            </svg>
            <span>In hóa đơn</span>
          </Link>
          
          <Link
            to="/admin/invoices"
            className="bg-gray-500 hover:bg-gray-600 text-white px-3 py-2 rounded flex items-center gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
            </svg>
            <span>Quay lại</span>
          </Link>
        </div>
      </div>
      
      {/* Invoice Information */}
      <div className="bg-white shadow-md rounded-md overflow-hidden mb-6">
        <div className="p-6">
          <div className="flex flex-col md:flex-row justify-between mb-8">
            <div className="mb-4 md:mb-0">
              <h2 className="text-lg font-semibold text-gray-800 mb-2">
                Mã hóa đơn: {invoice.code}
              </h2>
              <p className="text-sm text-gray-600 mb-2">
                Ngày: {formatDate(invoice.invoiceDate)} {formatTime(invoice.invoiceDate)}
              </p>
              <p className="text-sm text-gray-600 mb-2">
                Nhân viên: {invoice.user.fullName}
              </p>
              <p className="text-sm text-gray-600">
                Phương thức: {translatePaymentMethod(invoice.paymentMethod)}
              </p>
              {invoice.notes && (
                <p className="text-sm text-gray-600 mt-2">
                  Ghi chú: {invoice.notes}
                </p>
              )}
            </div>
            <div className="text-right">
              <span className={`px-3 py-1 inline-flex text-sm font-medium rounded-full ${getStatusColorClass(invoice.status)}`}>
                {translateInvoiceStatus(invoice.status)}
              </span>
              
              <div className="mt-3">
                {invoice.customerName ? (
                  <>
                    <p className="text-sm font-medium text-gray-800 mb-1">Khách hàng:</p>
                    <p className="text-sm text-gray-600">{invoice.customerName}</p>
                    {invoice.customerPhone && (
                      <p className="text-sm text-gray-600">{invoice.customerPhone}</p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-gray-600 italic">Khách lẻ</p>
                )}
              </div>
            </div>
          </div>
          
          {/* Invoice Items */}
          <h3 className="text-lg font-semibold mb-4">Chi tiết sản phẩm</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    STT
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Sản phẩm
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Đơn vị
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Số lượng
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Đơn giá
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Thành tiền
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {invoice.items.map((item, index) => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {index + 1}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {item.product.name}
                      </div>
                      <div className="text-xs text-gray-500">
                        {item.product.code}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item.productUnit.unit.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {item.quantity}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatCurrency(item.unitPrice)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatCurrency(item.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50">
                <tr>
                  <td colSpan={5} className="px-6 py-3 text-right text-sm font-medium text-gray-700">
                    Tổng tiền:
                  </td>
                  <td className="px-6 py-3 text-sm font-medium text-gray-900">
                    {formatCurrency(invoice.totalAmount)}
                  </td>
                </tr>
                {invoice.discount > 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-3 text-right text-sm font-medium text-gray-700">
                      Giảm giá:
                    </td>
                    <td className="px-6 py-3 text-sm font-medium text-gray-900">
                      {formatCurrency(invoice.discount)}
                    </td>
                  </tr>
                )}
                <tr>
                  <td colSpan={5} className="px-6 py-3 text-right text-sm font-bold text-gray-900">
                    Thành tiền:
                  </td>
                  <td className="px-6 py-3 text-sm font-bold text-gray-900">
                    {formatCurrency(invoice.finalAmount)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          
          {/* Transaction History */}
          {invoice.transactions.length > 0 && (
            <div className="mt-8">
              <h3 className="text-lg font-semibold mb-4">Lịch sử giao dịch</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Ngày
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Loại
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Số tiền
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Mô tả
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Người thực hiện
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {invoice.transactions.map((transaction) => (
                      <tr key={transaction.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {formatDate(transaction.date)} {formatTime(transaction.date)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 inline-flex text-xs leading-5 font-medium rounded-full ${
                            transaction.type === "INCOME" 
                              ? "bg-green-100 text-green-800" 
                              : "bg-red-100 text-red-800"
                          }`}>
                            {transaction.type === "INCOME" ? "Thu" : "Chi"}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {formatCurrency(transaction.amount)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {transaction.description}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {invoice.user.fullName}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          
          {/* Action Buttons */}
          <div className="mt-8 flex justify-end space-x-3">
            {invoice.status === "COMPLETED" && (
              <form method="post" action={`/admin/invoices/${invoice.id}/cancel`}>
                <button
                  type="submit"
                  className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-md flex items-center gap-2"
                  onClick={(e) => {
                    if (!confirm("Bạn có chắc chắn muốn hủy hóa đơn này không?")) {
                      e.preventDefault();
                    }
                  }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                  <span>Hủy hóa đơn</span>
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
