import { LoaderFunctionArgs, json, redirect } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import { db } from "~/utils/db.server";
import { requireStaff } from "~/utils/session.server";
import { CheckCircleIcon, PrinterIcon, ArrowLeftIcon } from "@heroicons/react/24/outline";

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
  const user = await requireStaff(request);
  
  if (!params.invoiceId) {
    return redirect("/sales");
  }

  const invoiceId = parseInt(params.invoiceId);
  
  const invoice = await db.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      user: {
        select: {
          fullName: true,
        },
      },
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
    },
  });

  if (!invoice) {
    return redirect("/sales");
  }

  return json({ invoice, currentUser: user });
};

export default function InvoiceDetail() {
  const { invoice, currentUser } = useLoaderData<typeof loader>();

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

  return (
    <div className="container mx-auto max-w-4xl p-4">
      <div className="bg-white rounded-lg shadow-md p-6">
        {/* Header */}
        <div className="flex justify-between items-start mb-6">
          <div>
            <Link
              to="/sales"
              className="inline-flex items-center text-blue-600 hover:text-blue-800 mb-2"
            >
              <ArrowLeftIcon className="h-4 w-4 mr-1" />
              Quay lại danh sách
            </Link>
            <h1 className="text-2xl font-bold">Chi tiết hóa đơn</h1>
          </div>
          <div className="flex">
            <button
              onClick={() => window.print()}
              className="bg-blue-600 text-white px-4 py-2 rounded-md flex items-center"
            >
              <PrinterIcon className="h-5 w-5 mr-1" />
              In hóa đơn
            </button>
          </div>
        </div>

        {/* Invoice Status */}
        <div className="mb-6 flex items-center">
          <div
            className={`flex items-center px-3 py-1 rounded-full text-sm font-medium ${
              invoice.status === "COMPLETED"
                ? "bg-green-100 text-green-800"
                : "bg-red-100 text-red-800"
            }`}
          >
            {invoice.status === "COMPLETED" && (
              <CheckCircleIcon className="h-4 w-4 mr-1" />
            )}
            {invoice.status === "COMPLETED" ? "Hoàn thành" : "Đã hủy"}
          </div>
          <span className="mx-2 text-gray-400">•</span>
          <span className="text-sm text-gray-500">
            Mã hóa đơn: <span className="font-medium">{invoice.code}</span>
          </span>
          <span className="mx-2 text-gray-400">•</span>
          <span className="text-sm text-gray-500">
            Ngày tạo: <span className="font-medium">{formatDate(invoice.createdAt)}</span>
          </span>
        </div>

        {/* Invoice Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="bg-gray-50 p-4 rounded-md">
            <h3 className="font-medium mb-3">Thông tin hóa đơn</h3>
            <div className="space-y-2 text-sm">
              <div className="grid grid-cols-2">
                <span className="text-gray-600">Ngày hóa đơn:</span>
                <span>{formatDate(invoice.invoiceDate)}</span>
              </div>
              <div className="grid grid-cols-2">
                <span className="text-gray-600">Người tạo:</span>
                <span>{invoice.user.fullName}</span>
              </div>
              <div className="grid grid-cols-2">
                <span className="text-gray-600">Phương thức thanh toán:</span>
                <span>{getPaymentMethodText(invoice.paymentMethod)}</span>
              </div>
              {invoice.notes && (
                <div className="grid grid-cols-2">
                  <span className="text-gray-600">Ghi chú:</span>
                  <span>{invoice.notes}</span>
                </div>
              )}
            </div>
          </div>

          <div className="bg-gray-50 p-4 rounded-md">
            <h3 className="font-medium mb-3">Thông tin khách hàng</h3>
            <div className="space-y-2 text-sm">
              <div className="grid grid-cols-2">
                <span className="text-gray-600">Tên khách hàng:</span>
                <span>{invoice.customerName || "Khách lẻ"}</span>
              </div>
              {invoice.customerPhone && (
                <div className="grid grid-cols-2">
                  <span className="text-gray-600">Số điện thoại:</span>
                  <span>{invoice.customerPhone}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Invoice Items */}
        <div className="mb-8">
          <h3 className="font-medium mb-3">Chi tiết sản phẩm</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    STT
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Sản phẩm
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Đơn vị
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Số lượng
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Đơn giá
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Thành tiền
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {invoice.items.map((item, index) => (
                  <tr key={item.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {index + 1}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {item.product.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item.productUnit.unit.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">
                      {item.quantity}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">
                      {item.unitPrice.toLocaleString("vi-VN")} đ
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">
                      {item.amount.toLocaleString("vi-VN")} đ
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Invoice Summary */}
        <div className="flex justify-end">
          <div className="w-64">
            <div className="flex justify-between py-2 border-b">
              <span className="font-medium">Tổng tiền:</span>
              <span>{invoice.totalAmount.toLocaleString("vi-VN")} đ</span>
            </div>
            <div className="flex justify-between py-2 border-b">
              <span className="font-medium">Chiết khấu:</span>
              <span>{invoice.discount.toLocaleString("vi-VN")} đ</span>
            </div>
            <div className="flex justify-between py-2 text-lg font-bold text-blue-600">
              <span>Thanh toán:</span>
              <span>{invoice.finalAmount.toLocaleString("vi-VN")} đ</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
