import { json, redirect, type LoaderFunctionArgs } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import { useState } from "react";
import { db } from "~/utils/db.server";

export const loader = async ({ params }: LoaderFunctionArgs) => {
  const purchaseOrderId = params.id;
  
  if (!purchaseOrderId || isNaN(Number(purchaseOrderId))) {
    return redirect("/admin/purchase-orders");
  }
  
  const purchaseOrder = await db.purchaseOrder.findUnique({
    where: { id: Number(purchaseOrderId) },
    include: {
      supplier: true,
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
      transactions: {
        include: {
            user: true,
        },
        orderBy: {
          date: "desc",
        },
      },
    },
  });
  
  if (!purchaseOrder) {
    throw new Response("Không tìm thấy đơn nhập hàng", { status: 404 });
  }
  
  return json({ purchaseOrder });
};

export default function AdminPurchaseOrderDetail() {
  const { purchaseOrder } = useLoaderData<typeof loader>();
  const [showPrintModal, setShowPrintModal] = useState(false);
  
  // Calculate payments and remaining
  const totalPaid = purchaseOrder.transactions.reduce(
    (sum, transaction) => sum + transaction.amount,
    0
  );
  
  const remainingAmount = purchaseOrder.totalAmount - totalPaid;
  
  // Format currency
  const formatCurrency = (amount: number) => {
    return amount.toLocaleString("vi-VN") + " đ";
  };
  
  // Format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("vi-VN");
  };
  
  // Format datetime
  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString("vi-VN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
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
  
  // Translate payment method
  const translatePaymentMethod = (method: string) => {
    switch (method) {
      case "CASH":
        return "Tiền mặt";
      case "TRANSFER":
        return "Chuyển khoản";
      case "CREDIT":
        return "Ghi nợ";
      default:
        return method;
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
    <div className="container mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">
          Chi tiết đơn nhập hàng: <span className="text-blue-600">{purchaseOrder.code}</span>
        </h1>
        <div className="flex gap-2">
          <Link
            to="/admin/purchase-orders"
            className="px-4 py-2 bg-gray-100 text-gray-800 rounded-md hover:bg-gray-200 flex items-center gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
            </svg>
            <span>Quay lại</span>
          </Link>
          <button 
            onClick={() => setShowPrintModal(true)}
            className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 flex items-center gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v3a2 2 0 002 2h1v2a2 2 0 002 2h6a2 2 0 002-2v-2h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a2 2 0 00-2-2H7a2 2 0 00-2 2zm8 0H7v3h6V4zm0 8H7v4h6v-4z" clipRule="evenodd" />
            </svg>
            <span>In đơn hàng</span>
          </button>
          
          {purchaseOrder.paymentStatus !== "PAID" && (
            <Link
              to={`/admin/purchase-orders/${purchaseOrder.id}/payment`}
              className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 flex items-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h8a2 2 0 012 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4zm6 4a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
              </svg>
              <span>Thanh toán</span>
            </Link>
          )}
          
          <Link
            to={`/admin/purchase-orders/${purchaseOrder.id}/edit`}
            className="px-4 py-2 bg-indigo-500 text-white rounded-md hover:bg-indigo-600 flex items-center gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
            </svg>
            <span>Chỉnh sửa</span>
          </Link>
        </div>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column - Order details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Order summary */}
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-lg font-semibold mb-4">Thông tin đơn nhập hàng</h2>
            
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-6">
              <div>
                <dt className="text-sm font-medium text-gray-500">Mã đơn nhập</dt>
                <dd className="mt-1 text-base font-semibold text-gray-900">{purchaseOrder.code}</dd>
              </div>
              
              <div>
                <dt className="text-sm font-medium text-gray-500">Ngày nhập</dt>
                <dd className="mt-1 text-base text-gray-900">{formatDate(purchaseOrder.orderDate)}</dd>
              </div>
              
              <div>
                <dt className="text-sm font-medium text-gray-500">Trạng thái thanh toán</dt>
                <dd className="mt-1">
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColorClass(purchaseOrder.paymentStatus)}`}>
                    {translatePaymentStatus(purchaseOrder.paymentStatus)}
                  </span>
                </dd>
              </div>
              
              <div>
                <dt className="text-sm font-medium text-gray-500">Phương thức thanh toán</dt>
                <dd className="mt-1 text-base text-gray-900">{translatePaymentMethod(purchaseOrder.paymentMethod)}</dd>
              </div>
              
              <div>
                <dt className="text-sm font-medium text-gray-500">Nhà cung cấp</dt>
                <dd className="mt-1 text-base text-gray-900">
                  <Link to={`/admin/suppliers/${purchaseOrder.supplier.id}`} className="text-blue-600 hover:underline">
                    {purchaseOrder.supplier.name}
                  </Link>
                </dd>
              </div>
              
              <div>
                <dt className="text-sm font-medium text-gray-500">Người tạo đơn</dt>
                <dd className="mt-1 text-base text-gray-900">{purchaseOrder.user.fullName}</dd>
              </div>
              
              <div className="sm:col-span-2">
                <dt className="text-sm font-medium text-gray-500">Ghi chú</dt>
                <dd className="mt-1 text-base text-gray-900">{purchaseOrder.notes || "Không có ghi chú"}</dd>
              </div>
            </dl>
          </div>
          
          {/* Products table */}
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-lg font-semibold mb-4">Chi tiết sản phẩm</h2>
            
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Mã SP
                    </th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Tên sản phẩm
                    </th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Đơn vị
                    </th>
                    <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Số lượng
                    </th>
                    <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Đơn giá
                    </th>
                    <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Thành tiền
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {purchaseOrder.items.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                        <Link to={`/admin/products/${item.productId}`} className="text-blue-600 hover:underline">
                          {item.product.code}
                        </Link>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                        {item.product.name}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                        {item.productUnit.unit.name}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900">
                        {item.quantity}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900">
                        {formatCurrency(item.costPrice)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-semibold text-gray-900">
                        {formatCurrency(item.quantity * item.costPrice)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50">
                  <tr>
                    <th colSpan={5} className="px-4 py-3 text-right text-sm font-semibold text-gray-900">
                      Tổng cộng:
                    </th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900">
                      {formatCurrency(purchaseOrder.totalAmount)}
                    </th>
                  </tr>
                  {purchaseOrder.paymentStatus !== "UNPAID" && (
                    <>
                      <tr>
                        <th colSpan={5} className="px-4 py-3 text-right text-sm font-medium text-gray-500">
                          Đã thanh toán:
                        </th>
                        <th className="px-4 py-3 text-right text-sm text-green-600">
                          {formatCurrency(totalPaid)}
                        </th>
                      </tr>
                      {purchaseOrder.paymentStatus === "PARTIAL" && (
                        <tr>
                          <th colSpan={5} className="px-4 py-3 text-right text-sm font-medium text-gray-500">
                            Còn lại:
                          </th>
                          <th className="px-4 py-3 text-right text-sm text-red-600">
                            {formatCurrency(remainingAmount)}
                          </th>
                        </tr>
                      )}
                    </>
                  )}
                </tfoot>
              </table>
            </div>
            
            {/* Batch and expiry information */}
            {purchaseOrder.items.some(item => item.batchNumber || item.expiryDate) && (
              <div className="mt-6 border-t pt-4">
                <h3 className="text-md font-semibold mb-2">Thông tin lô và hạn sử dụng</h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Sản phẩm
                        </th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Lô
                        </th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Hạn sử dụng
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {purchaseOrder.items
                        .filter(item => item.batchNumber || item.expiryDate)
                        .map((item) => (
                          <tr key={`batch-${item.id}`} className="hover:bg-gray-50">
                            <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                              {item.product.name}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                              {item.batchNumber || "-"}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                              {item.expiryDate ? formatDate(item.expiryDate) : "-"}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
        
        {/* Right column - Payment and history */}
        <div className="space-y-6">
          {/* Payment summary */}
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-lg font-semibold mb-4">Thông tin thanh toán</h2>
            
            <div className="flex justify-between items-center py-3 border-b">
              <span className="text-gray-600">Tổng tiền:</span>
              <span className="text-xl font-semibold">{formatCurrency(purchaseOrder.totalAmount)}</span>
            </div>
            
            <div className="flex justify-between items-center py-3 border-b">
              <span className="text-gray-600">Đã thanh toán:</span>
              <span className="text-xl font-semibold text-green-600">{formatCurrency(totalPaid)}</span>
            </div>
            
            <div className="flex justify-between items-center py-3">
              <span className="text-gray-600">Còn lại:</span>
              <span className="text-xl font-semibold text-red-600">{formatCurrency(remainingAmount)}</span>
            </div>
            
            {purchaseOrder.paymentStatus !== "PAID" && (
              <div className="mt-4">
                <Link
                  to={`/admin/purchase-orders/${purchaseOrder.id}/payment`}
                  className="w-full py-2 px-4 bg-green-500 hover:bg-green-600 text-white rounded-md flex items-center justify-center gap-2"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h8a2 2 0 012 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4zm6 4a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                  </svg>
                  <span>Thanh toán</span>
                </Link>
              </div>
            )}
          </div>
          
          {/* Payment history */}
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-lg font-semibold mb-4">Lịch sử thanh toán</h2>
            
            {purchaseOrder.transactions.length > 0 ? (
              <div className="space-y-4">
                {purchaseOrder.transactions.map((transaction) => (
                  <div key={transaction.id} className="border border-gray-200 rounded-md p-3">
                    <div className="flex justify-between">
                      <span className="text-xs text-gray-500">
                        {formatDateTime(transaction.date)}
                      </span>
                      <span className="text-sm font-semibold text-green-600">
                        {formatCurrency(transaction.amount)}
                      </span>
                    </div>
                    <div className="mt-1">
                      <p className="text-sm text-gray-700">{transaction.description}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        Người thực hiện: {transaction.user.fullName}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-4 text-gray-500">
                Chưa có giao dịch thanh toán nào
              </div>
            )}
          </div>
          
          {/* Additional actions */}
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-lg font-semibold mb-4">Thao tác khác</h2>
            
            <div className="space-y-3">
              <Link
                to={`/admin/purchase-orders/${purchaseOrder.id}/edit`}
                className="w-full py-2 px-4 bg-indigo-500 hover:bg-indigo-600 text-white rounded-md flex items-center justify-center gap-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                </svg>
                <span>Chỉnh sửa đơn nhập</span>
              </Link>
              
              <button 
                onClick={() => setShowPrintModal(true)}
                className="w-full py-2 px-4 bg-blue-500 hover:bg-blue-600 text-white rounded-md flex items-center justify-center gap-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v3a2 2 0 002 2h1v2a2 2 0 002 2h6a2 2 0 002-2v-2h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a2 2 0 00-2-2H7a2 2 0 00-2 2zm8 0H7v3h6V4zm0 8H7v4h6v-4z" clipRule="evenodd" />
                </svg>
                <span>In đơn nhập hàng</span>
              </button>
              
              <Link
                to={`/admin/purchase-orders/duplicate/${purchaseOrder.id}`}
                className="w-full py-2 px-4 bg-gray-500 hover:bg-gray-600 text-white rounded-md flex items-center justify-center gap-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M7 9a2 2 0 012-2h6a2 2 0 012 2v6a2 2 0 01-2 2H9a2 2 0 01-2-2V9z" />
                  <path d="M5 3a2 2 0 00-2 2v6a2 2 0 002 2V5h8a2 2 0 00-2-2H5z" />
                </svg>
                <span>Nhân bản đơn nhập</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
      
      {/* Print modal */}
      {showPrintModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full flex items-center justify-center z-50">
          <div className="bg-white p-4 rounded-md shadow-md max-w-xl mx-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">In đơn nhập hàng</h2>
              <button 
                onClick={() => setShowPrintModal(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 border rounded-md hover:bg-gray-50 cursor-pointer">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <div>
                  <h3 className="font-medium">Đơn nhập hàng</h3>
                  <p className="text-sm text-gray-500">In chi tiết đơn nhập hàng</p>
                </div>
              </div>
              
              <div className="flex items-center gap-3 p-3 border rounded-md hover:bg-gray-50 cursor-pointer">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <div>
                  <h3 className="font-medium">Phiếu nhập kho</h3>
                  <p className="text-sm text-gray-500">In phiếu nhập kho cho bộ phận kho</p>
                </div>
              </div>
              
              <div className="flex items-center gap-3 p-3 border rounded-md hover:bg-gray-50 cursor-pointer">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2z" />
                </svg>
                <div>
                  <h3 className="font-medium">Phiếu thanh toán</h3>
                  <p className="text-sm text-gray-500">In phiếu thanh toán cho nhà cung cấp</p>
                </div>
              </div>
            </div>
            
            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setShowPrintModal(false)}
                className="px-4 py-2 bg-gray-200 rounded-md hover:bg-gray-300"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
