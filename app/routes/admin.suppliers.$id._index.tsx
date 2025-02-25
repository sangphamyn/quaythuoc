import { json, redirect, type LoaderFunctionArgs } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import { db } from "~/utils/db.server";

export const loader = async ({ params }: LoaderFunctionArgs) => {
  const supplierId = params.id;
  
  if (!supplierId || isNaN(Number(supplierId))) {
    return redirect("/admin/suppliers");
  }
  
  const supplier = await db.supplier.findUnique({
    where: { id: Number(supplierId) },
    include: {
      purchaseOrders: {
        take: 10,
        orderBy: { orderDate: "desc" },
        include: {
          user: true,
          items: {
            include: {
              product: true,
            }
          }
        }
      },
      _count: {
        select: {
          purchaseOrders: true
        }
      }
    }
  });
  
  if (!supplier) {
    throw new Response("Không tìm thấy nhà cung cấp", { status: 404 });
  }
  
  return json({ supplier });
};

export default function AdminSupplierDetail() {
  const { supplier } = useLoaderData<typeof loader>();
  
  // Tính tổng giá trị đã mua từ nhà cung cấp
  const totalPurchaseAmount = supplier.purchaseOrders.reduce(
    (total, order) => total + order.totalAmount, 
    0
  );
  
  // Lấy danh sách các sản phẩm đã mua 
  const purchasedProducts = supplier.purchaseOrders.flatMap(order => 
    order.items.map(item => ({
      id: item.product.id,
      code: item.product.code,
      name: item.product.name,
      quantity: item.quantity,
      costPrice: item.costPrice,
      orderDate: order.orderDate,
      purchaseOrderId: order.id,
      purchaseOrderCode: order.code,
    }))
  );
  
  return (
    <div className="container mx-auto p-4 max-w-6xl">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Chi tiết nhà cung cấp</h1>
        <div className="flex gap-2">
          <Link
            to="/admin/suppliers"
            className="px-4 py-2 bg-gray-100 text-gray-800 rounded-md hover:bg-gray-200 flex items-center gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
            </svg>
            <span>Quay lại</span>
          </Link>
          <Link
            to={`/admin/suppliers/${supplier.id}/edit`}
            className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 flex items-center gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
            </svg>
            <span>Chỉnh sửa</span>
          </Link>
        </div>
      </div>
      
      {/* Supplier details */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Basic info */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden col-span-2">
          <div className="px-6 py-4 border-b">
            <h2 className="text-lg font-semibold">Thông tin nhà cung cấp</h2>
          </div>
          <div className="p-6">
            <dl className="divide-y divide-gray-200">
              <div className="grid grid-cols-1 sm:grid-cols-3 py-3">
                <dt className="text-sm font-medium text-gray-500 sm:col-span-1">Tên nhà cung cấp</dt>
                <dd className="text-sm text-gray-900 sm:col-span-2">{supplier.name}</dd>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 py-3">
                <dt className="text-sm font-medium text-gray-500 sm:col-span-1">Người liên hệ</dt>
                <dd className="text-sm text-gray-900 sm:col-span-2">{supplier.contactPerson || "—"}</dd>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 py-3">
                <dt className="text-sm font-medium text-gray-500 sm:col-span-1">Số điện thoại</dt>
                <dd className="text-sm text-gray-900 sm:col-span-2">{supplier.phone || "—"}</dd>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 py-3">
                <dt className="text-sm font-medium text-gray-500 sm:col-span-1">Email</dt>
                <dd className="text-sm text-gray-900 sm:col-span-2">{supplier.email || "—"}</dd>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 py-3">
                <dt className="text-sm font-medium text-gray-500 sm:col-span-1">Địa chỉ</dt>
                <dd className="text-sm text-gray-900 sm:col-span-2">{supplier.address || "—"}</dd>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 py-3">
                <dt className="text-sm font-medium text-gray-500 sm:col-span-1">Ghi chú</dt>
                <dd className="text-sm text-gray-900 sm:col-span-2">{supplier.notes || "—"}</dd>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 py-3">
                <dt className="text-sm font-medium text-gray-500 sm:col-span-1">Ngày tạo</dt>
                <dd className="text-sm text-gray-900 sm:col-span-2">
                  {new Date(supplier.createdAt).toLocaleDateString("vi-VN", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit"
                  })}
                </dd>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 py-3">
                <dt className="text-sm font-medium text-gray-500 sm:col-span-1">Cập nhật lần cuối</dt>
                <dd className="text-sm text-gray-900 sm:col-span-2">
                  {new Date(supplier.updatedAt).toLocaleDateString("vi-VN", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit"
                  })}
                </dd>
              </div>
            </dl>
          </div>
        </div>
        
        {/* Purchase summary */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="px-6 py-4 border-b">
            <h2 className="text-lg font-semibold">Tổng quan mua hàng</h2>
          </div>
          <div className="p-6">
            <div className="flex flex-col gap-4">
              <div className="flex justify-between items-center p-4 bg-blue-50 rounded-lg">
                <span className="text-blue-800 font-medium">Tổng số đơn nhập</span>
                <span className="text-xl font-bold text-blue-800">{supplier._count.purchaseOrders}</span>
              </div>
              
              <div className="flex justify-between items-center p-4 bg-green-50 rounded-lg">
                <span className="text-green-800 font-medium">Tổng giá trị đã mua</span>
                <span className="text-xl font-bold text-green-800">
                  {totalPurchaseAmount.toLocaleString("vi-VN")} đ
                </span>
              </div>
              
              <div className="flex justify-between items-center p-4 bg-amber-50 rounded-lg">
                <span className="text-amber-800 font-medium">Đơn nhập gần đây</span>
                <span className="text-xl font-bold text-amber-800">
                  {supplier.purchaseOrders.length > 0 
                    ? new Date(supplier.purchaseOrders[0].orderDate).toLocaleDateString("vi-VN") 
                    : "—"}
                </span>
              </div>
            </div>
            
            {supplier.purchaseOrders.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <Link
                  to={`/admin/purchase-orders/new?supplierId=${supplier.id}`}
                  className="w-full py-2 px-4 bg-blue-500 hover:bg-blue-600 text-white rounded-md flex items-center justify-center gap-2"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                  </svg>
                  <span>Tạo đơn nhập hàng mới</span>
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Recent purchase orders */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden mb-8">
        <div className="px-6 py-4 border-b">
          <h2 className="text-lg font-semibold">Đơn nhập hàng gần đây</h2>
        </div>
        <div className="p-6">
          {supplier.purchaseOrders.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Mã đơn
                    </th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Ngày nhập
                    </th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Nhân viên
                    </th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Tổng tiền
                    </th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Trạng thái
                    </th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Số lượng SP
                    </th>
                    <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Thao tác
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {supplier.purchaseOrders.map((order) => (
                    <tr key={order.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-blue-600">
                        <Link to={`/admin/purchase-orders/${order.id}`}>
                          {order.code}
                        </Link>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                        {new Date(order.orderDate).toLocaleDateString("vi-VN")}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                        {order.user.fullName}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                        {order.totalAmount.toLocaleString("vi-VN")} đ
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">
                        <span className={`px-2 py-1 inline-flex text-xs leading-5 font-medium rounded-full ${
                          order.paymentStatus === "PAID" 
                            ? "bg-green-100 text-green-800" 
                            : order.paymentStatus === "PARTIAL" 
                            ? "bg-yellow-100 text-yellow-800"
                            : "bg-red-100 text-red-800"
                        }`}>
                          {order.paymentStatus === "PAID" 
                            ? "Đã thanh toán" 
                            : order.paymentStatus === "PARTIAL" 
                            ? "Một phần"
                            : "Chưa thanh toán"}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                        {order.items.length}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
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
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              Chưa có đơn nhập hàng nào từ nhà cung cấp này
              <div className="mt-4">
                <Link
                  to={`/admin/purchase-orders/new?supplierId=${supplier.id}`}
                  className="py-2 px-4 bg-blue-500 hover:bg-blue-600 text-white rounded-md inline-flex items-center gap-2"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                  </svg>
                  <span>Tạo đơn nhập hàng mới</span>
                </Link>
              </div>
            </div>
          )}
        </div>
        
        {supplier._count.purchaseOrders > 10 && (
          <div className="px-6 py-3 bg-gray-50 border-t">
            <Link 
              to={`/admin/purchase-orders?supplierId=${supplier.id}`}
              className="text-blue-600 hover:text-blue-800 text-sm font-medium"
            >
              Xem tất cả {supplier._count.purchaseOrders} đơn nhập hàng →
            </Link>
          </div>
        )}
      </div>
      
      {/* Purchased products */}
      {purchasedProducts.length > 0 && (
        <div className="bg-white rounded-lg shadow-md overflow-hidden mb-8">
          <div className="px-6 py-4 border-b">
            <h2 className="text-lg font-semibold">Sản phẩm đã nhập</h2>
          </div>
          <div className="p-6">
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
                      Đơn nhập
                    </th>
                    <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Số lượng
                    </th>
                    <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Giá nhập
                    </th>
                    <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Thành tiền
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {purchasedProducts.map((product, index) => (
                    <tr key={`${product.id}-${index}`} className="hover:bg-gray-50">
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                        <Link to={`/admin/products/${product.id}`} className="text-blue-600 hover:underline">
                          {product.code}
                        </Link>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                        {product.name}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                        <Link to={`/admin/purchase-orders/${product.purchaseOrderId}`} className="text-blue-600 hover:underline">
                          {product.purchaseOrderCode}
                        </Link>
                        <span className="text-xs text-gray-500 ml-2">
                          ({new Date(product.orderDate).toLocaleDateString("vi-VN")})
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-700">
                        {product.quantity}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-700">
                        {product.costPrice.toLocaleString("vi-VN")} đ
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-medium text-gray-900">
                        {(product.quantity * product.costPrice).toLocaleString("vi-VN")} đ
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
