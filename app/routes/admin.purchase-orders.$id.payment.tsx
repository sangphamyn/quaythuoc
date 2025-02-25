import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { Form, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import { useEffect, useRef } from "react";
import { db } from "~/utils/db.server";
import { getUserId } from "~/utils/session.server";

export const loader = async ({ params }: LoaderFunctionArgs) => {
  const purchaseOrderId = params.id;
  
  if (!purchaseOrderId || isNaN(Number(purchaseOrderId))) {
    return redirect("/admin/purchase-orders");
  }
  
  const purchaseOrder = await db.purchaseOrder.findUnique({
    where: { id: Number(purchaseOrderId) },
    include: {
      supplier: true,
      transactions: {
        orderBy: {
          date: "desc",
        },
      },
    },
  });
  
  if (!purchaseOrder) {
    throw new Response("Không tìm thấy đơn nhập hàng", { status: 404 });
  }
  
  // Check if the purchase order is already fully paid
  if (purchaseOrder.paymentStatus === "PAID") {
    return redirect(`/admin/purchase-orders/${purchaseOrderId}`);
  }
  
  // Calculate total paid and remaining amount
  const totalPaid = purchaseOrder.transactions.reduce(
    (sum, transaction) => sum + transaction.amount,
    0
  );
  
  const remainingAmount = purchaseOrder.totalAmount - totalPaid;
  
  return json({ 
    purchaseOrder,
    totalPaid,
    remainingAmount,
  });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const purchaseOrderId = params.id;
  
  if (!purchaseOrderId || isNaN(Number(purchaseOrderId))) {
    return redirect("/admin/purchase-orders");
  }
  
  const formData = await request.formData();
  const amount = formData.get("amount");
  const paymentMethod = formData.get("paymentMethod");
  const description = formData.get("description");
  
  // Simulate getting the current user from session
  // In a real app, you would get this from the authentication system
  const currentUserId = await getUserId(request); // Placeholder for the actual user ID
  
  const errors: Record<string, string> = {};
  
  // Validate amount
  if (!amount || typeof amount !== "string") {
    errors.amount = "Số tiền thanh toán là bắt buộc";
  } else {
    const amountValue = parseFloat(amount);
    if (isNaN(amountValue) || amountValue <= 0) {
      errors.amount = "Số tiền thanh toán phải là số dương";
    }
  }
  
  // Validate payment method
  if (!paymentMethod || typeof paymentMethod !== "string") {
    errors.paymentMethod = "Phương thức thanh toán là bắt buộc";
  } else if (!["CASH", "TRANSFER", "CREDIT"].includes(paymentMethod)) {
    errors.paymentMethod = "Phương thức thanh toán không hợp lệ";
  }
  
  if (Object.keys(errors).length > 0) {
    return { errors, values: { amount, paymentMethod, description } };
  }
  
  // Get the purchase order to check current payment status
  const purchaseOrder = await db.purchaseOrder.findUnique({
    where: { id: Number(purchaseOrderId) },
    include: {
      transactions: true,
    },
  });
  
  if (!purchaseOrder) {
    throw new Response("Không tìm thấy đơn nhập hàng", { status: 404 });
  }
  
  // Calculate current total paid
  const currentTotalPaid = purchaseOrder.transactions.reduce(
    (sum, transaction) => sum + transaction.amount,
    0
  );
  
  // Calculate remaining amount before this payment
  const remainingBeforePayment = purchaseOrder.totalAmount - currentTotalPaid;
  
  // New payment amount
  const paymentAmount = parseFloat(amount as string);
  
  // Validate that payment is not greater than remaining amount
  if (paymentAmount > remainingBeforePayment) {
    return { 
      errors: { 
        amount: `Số tiền thanh toán không thể lớn hơn số tiền còn lại (${remainingBeforePayment.toLocaleString("vi-VN")} đ)` 
      }, 
      values: { amount, paymentMethod, description } 
    };
  }
  
  // Determine new payment status after this payment
  let newPaymentStatus = purchaseOrder.paymentStatus;
  const remainingAfterPayment = remainingBeforePayment - paymentAmount;
  
  if (remainingAfterPayment === 0) {
    newPaymentStatus = "PAID";
  } else if (purchaseOrder.paymentStatus === "UNPAID" && paymentAmount > 0) {
    newPaymentStatus = "PARTIAL";
  }
  
  // Start a transaction to ensure data consistency
  try {
    await db.$transaction(async (tx) => {
      // 1. Create the payment transaction
      await tx.transaction.create({
        data: {
          date: new Date(),
          type: "EXPENSE",
          amount: paymentAmount,
          description: description as string || `Thanh toán đơn nhập hàng ${purchaseOrder.code}`,
          userId: currentUserId,
          relatedType: "PURCHASE",
          purchaseOrderId: Number(purchaseOrderId),
        },
      });
      
      // 2. Update purchase order payment status
      await tx.purchaseOrder.update({
        where: { id: Number(purchaseOrderId) },
        data: {
          paymentStatus: newPaymentStatus,
        },
      });
    });
    
    return redirect(`/admin/purchase-orders/${purchaseOrderId}`);
  } catch (error) {
    console.error("Error processing payment:", error);
    return { 
      errors: { _form: "Đã xảy ra lỗi khi xử lý thanh toán. Vui lòng thử lại." },
      values: { amount, paymentMethod, description }
    };
  }
};

export default function PurchaseOrderPayment() {
  const { purchaseOrder, totalPaid, remainingAmount } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const amountRef = useRef<HTMLInputElement>(null);
  const isSubmitting = navigation.state === "submitting";
  
  // Format currency
  const formatCurrency = (amount: number) => {
    return amount.toLocaleString("vi-VN") + " đ";
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
  
  // Format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("vi-VN");
  };
  
  useEffect(() => {
    if (actionData?.errors?.amount) {
      amountRef.current?.focus();
    }
  }, [actionData]);
  
  return (
    <div className="container mx-auto max-w-4xl">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">
          Thanh toán đơn nhập hàng: <span className="text-blue-600">{purchaseOrder.code}</span>
        </h1>
        <a
          href={`/admin/purchase-orders/${purchaseOrder.id}`}
          className="px-4 py-2 bg-gray-100 text-gray-800 rounded-md hover:bg-gray-200 flex items-center gap-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
          </svg>
          <span>Quay lại</span>
        </a>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2">
          {/* Payment form */}
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-lg font-semibold mb-4">Thông tin thanh toán</h2>
            
            {actionData?.errors?._form && (
              <div className="mb-4 p-3 border border-red-200 bg-red-50 text-red-700 rounded">
                {actionData.errors._form}
              </div>
            )}
            
            <Form method="post">
              <div className="mb-4">
                <label htmlFor="amount" className="block text-sm font-medium text-gray-700 mb-1">
                  Số tiền thanh toán <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    ref={amountRef}
                    type="number"
                    id="amount"
                    name="amount"
                    min="0"
                    defaultValue={actionData?.values?.amount || remainingAmount}
                    className={`w-full px-3 py-2 border rounded-md pr-9 ${
                      actionData?.errors?.amount
                        ? "border-red-500 focus:outline-red-500"
                        : "border-gray-300 focus:outline-blue-500"
                    }`}
                    placeholder="Nhập số tiền thanh toán"
                  />
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                    <span className="text-gray-500">đ</span>
                  </div>
                </div>
                {actionData?.errors?.amount && (
                  <p className="text-red-500 text-sm mt-1">{actionData.errors.amount}</p>
                )}
                <p className="text-sm text-gray-500 mt-1">
                  Số tiền còn lại: {formatCurrency(remainingAmount)}
                </p>
              </div>
              
              <div className="mb-4">
                <label htmlFor="paymentMethod" className="block text-sm font-medium text-gray-700 mb-1">
                  Phương thức thanh toán <span className="text-red-500">*</span>
                </label>
                <select
                  id="paymentMethod"
                  name="paymentMethod"
                  defaultValue={actionData?.values?.paymentMethod || purchaseOrder.paymentMethod}
                  className={`w-full px-3 py-2 border rounded-md appearance-none bg-white ${
                    actionData?.errors?.paymentMethod
                      ? "border-red-500 focus:outline-red-500"
                      : "border-gray-300 focus:outline-blue-500"
                  }`}
                >
                  <option value="CASH">Tiền mặt</option>
                  <option value="TRANSFER">Chuyển khoản</option>
                  <option value="CREDIT">Ghi nợ</option>
                </select>
                {actionData?.errors?.paymentMethod && (
                  <p className="text-red-500 text-sm mt-1">{actionData.errors.paymentMethod}</p>
                )}
              </div>
              
              <div className="mb-6">
                <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                  Ghi chú
                </label>
                <textarea
                  id="description"
                  name="description"
                  defaultValue={actionData?.values?.description || `Thanh toán đơn nhập hàng ${purchaseOrder.code}`}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-blue-500"
                  placeholder="Nhập ghi chú thanh toán (không bắt buộc)"
                  rows={3}
                />
              </div>
              
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className={`px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 flex items-center gap-2 ${
                    isSubmitting ? "opacity-70 cursor-not-allowed" : ""
                  }`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h8a2 2 0 012 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4zm6 4a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                  </svg>
                  <span>{isSubmitting ? "Đang xử lý..." : "Xác nhận thanh toán"}</span>
                </button>
              </div>
            </Form>
          </div>
        </div>
        
        <div>
          {/* Order summary */}
          <div className="bg-white p-6 rounded-lg shadow-md mb-6">
            <h2 className="text-lg font-semibold mb-4">Thông tin đơn hàng</h2>
            
            <dl className="space-y-3">
              <div className="flex justify-between">
                <dt className="text-sm font-medium text-gray-500">Mã đơn nhập:</dt>
                <dd className="text-sm font-semibold text-gray-900">{purchaseOrder.code}</dd>
              </div>
              
              <div className="flex justify-between">
                <dt className="text-sm font-medium text-gray-500">Ngày nhập:</dt>
                <dd className="text-sm text-gray-900">{formatDate(purchaseOrder.orderDate)}</dd>
              </div>
              
              <div className="flex justify-between">
                <dt className="text-sm font-medium text-gray-500">Nhà cung cấp:</dt>
                <dd className="text-sm text-gray-900">{purchaseOrder.supplier.name}</dd>
              </div>
              
              <div className="flex justify-between">
                <dt className="text-sm font-medium text-gray-500">Phương thức:</dt>
                <dd className="text-sm text-gray-900">{translatePaymentMethod(purchaseOrder.paymentMethod)}</dd>
              </div>
              
              <div className="border-t pt-3 mt-3">
                <div className="flex justify-between">
                  <dt className="text-sm font-medium text-gray-500">Tổng tiền:</dt>
                  <dd className="text-sm font-semibold text-gray-900">{formatCurrency(purchaseOrder.totalAmount)}</dd>
                </div>
              </div>
              
              <div className="flex justify-between">
                <dt className="text-sm font-medium text-gray-500">Đã thanh toán:</dt>
                <dd className="text-sm font-semibold text-green-600">{formatCurrency(totalPaid)}</dd>
              </div>
              
              <div className="flex justify-between">
                <dt className="text-sm font-medium text-gray-500">Còn lại:</dt>
                <dd className="text-sm font-semibold text-red-600">{formatCurrency(remainingAmount)}</dd>
              </div>
            </dl>
          </div>
          
          {/* Payment history */}
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-lg font-semibold mb-4">Lịch sử thanh toán</h2>
            
            {purchaseOrder.transactions.length > 0 ? (
              <div className="space-y-3">
                {purchaseOrder.transactions.map((transaction) => (
                  <div key={transaction.id} className="border border-gray-200 rounded-md p-3">
                    <div className="flex justify-between">
                      <span className="text-xs text-gray-500">
                        {formatDate(transaction.date)}
                      </span>
                      <span className="text-sm font-semibold text-green-600">
                        {formatCurrency(transaction.amount)}
                      </span>
                    </div>
                    <div className="mt-1">
                      <p className="text-sm text-gray-700">{transaction.description}</p>
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
        </div>
      </div>
    </div>
  );
}
