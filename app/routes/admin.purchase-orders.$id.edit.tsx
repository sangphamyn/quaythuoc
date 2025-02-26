import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { Form, Link, useActionData, useLoaderData, useNavigation, useSubmit } from "@remix-run/react";
import { useEffect, useState } from "react";
import { db } from "~/utils/db.server";

export const loader = async ({ params }: LoaderFunctionArgs) => {
  const purchaseOrderId = params.id;
  
  if (!purchaseOrderId || isNaN(Number(purchaseOrderId))) {
    throw json({ message: "Mã đơn nhập hàng không hợp lệ" }, { status: 400 });
  }
  
  const [purchaseOrder, suppliers, products, units] = await Promise.all([
    db.purchaseOrder.findUnique({
      where: {
        id: Number(purchaseOrderId),
      },
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
      },
    }),
    db.supplier.findMany({
      orderBy: {
        name: "asc",
      },
    }),
    db.product.findMany({
      orderBy: {
        name: "asc",
      },
      include: {
        productUnits: {
          include: {
            unit: true,
          },
        },
      },
    }),
    db.unit.findMany({
      orderBy: {
        name: "asc",
      },
    }),
  ]);
  
  if (!purchaseOrder) {
    throw json({ message: "Không tìm thấy đơn nhập hàng" }, { status: 404 });
  }
  
  // If the purchase order is already paid, redirect to view page
  if (purchaseOrder.paymentStatus === "PAID") {
    return redirect(`/admin/purchase-orders/${purchaseOrderId}`);
  }
  
  // Format dates for form fields
  const formattedDate = new Date(purchaseOrder.orderDate).toISOString().split('T')[0];
  
  return json({
    purchaseOrder: {
      ...purchaseOrder,
      orderDate: formattedDate,
      items: purchaseOrder.items.map(item => ({
        ...item,
        expiryDate: item.expiryDate 
          ? new Date(item.expiryDate).toISOString().split('T')[0] 
          : null,
      })),
    },
    suppliers,
    products,
    units,
  });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const purchaseOrderId = params.id;
  
  if (!purchaseOrderId || isNaN(Number(purchaseOrderId))) {
    return json({ success: false, error: "Mã đơn nhập hàng không hợp lệ" }, { status: 400 });
  }
  
  // Check if the purchase order exists and is not PAID
  const existingOrder = await db.purchaseOrder.findUnique({
    where: {
      id: Number(purchaseOrderId),
    },
  });
  
  if (!existingOrder) {
    return json({ success: false, error: "Không tìm thấy đơn nhập hàng" }, { status: 404 });
  }
  
  if (existingOrder.paymentStatus === "PAID") {
    return json({ 
      success: false, 
      error: "Không thể chỉnh sửa đơn nhập hàng đã thanh toán đầy đủ" 
    }, { status: 400 });
  }
  
  const formData = await request.formData();
  
  // Check form action
  const action = formData.get("_action");
  
  if (action === "delete-item") {
    const itemId = formData.get("itemId");
    
    if (!itemId || isNaN(Number(itemId))) {
      return json({ success: false, error: "Mã sản phẩm không hợp lệ" }, { status: 400 });
    }
    
    try {
      await db.purchaseOrderItem.delete({
        where: {
          id: Number(itemId),
        },
      });
      
      // Recalculate order total after deleting the item
      const remainingItems = await db.purchaseOrderItem.findMany({
        where: {
          purchaseOrderId: Number(purchaseOrderId),
        },
      });
      
      const newTotal = remainingItems.reduce(
        (sum, item) => sum + item.quantity * item.costPrice, 
        0
      );
      
      await db.purchaseOrder.update({
        where: {
          id: Number(purchaseOrderId),
        },
        data: {
          totalAmount: newTotal,
        },
      });
      
      return json({ success: true, message: "Đã xóa sản phẩm khỏi đơn nhập hàng" });
    } catch (error) {
      console.error("Error deleting item:", error);
      return json({
        success: false,
        error: "Lỗi khi xóa sản phẩm khỏi đơn nhập hàng",
      }, { status: 500 });
    }
  } else if (action === "add-item") {
    const productId = formData.get("productId");
    const productUnitId = formData.get("productUnitId");
    const quantity = formData.get("quantity");
    const costPrice = formData.get("costPrice");
    const batchNumber = formData.get("batchNumber") || null;
    const expiryDate = formData.get("expiryDate") || null;
    
    // Validate required fields
    if (!productId || !productUnitId || !quantity || !costPrice) {
      return json({
        success: false,
        error: "Vui lòng nhập đầy đủ thông tin sản phẩm",
      }, { status: 400 });
    }
    
    try {
      // Create new purchase order item
      await db.purchaseOrderItem.create({
        data: {
          purchaseOrderId: Number(purchaseOrderId),
          productId: Number(productId),
          productUnitId: Number(productUnitId),
          quantity: Number(quantity),
          costPrice: Number(costPrice),
          batchNumber: batchNumber ? String(batchNumber) : null,
          expiryDate: expiryDate ? new Date(String(expiryDate)) : null,
        },
      });
      
      // Recalculate order total after adding the item
      const allItems = await db.purchaseOrderItem.findMany({
        where: {
          purchaseOrderId: Number(purchaseOrderId),
        },
      });
      
      const newTotal = allItems.reduce(
        (sum, item) => sum + item.quantity * item.costPrice, 
        0
      );
      
      await db.purchaseOrder.update({
        where: {
          id: Number(purchaseOrderId),
        },
        data: {
          totalAmount: newTotal,
        },
      });
      
      return json({ success: true, message: "Đã thêm sản phẩm vào đơn nhập hàng" });
    } catch (error) {
      console.error("Error adding item:", error);
      return json({
        success: false,
        error: "Lỗi khi thêm sản phẩm vào đơn nhập hàng",
      }, { status: 500 });
    }
  } else {
    // Update purchase order information
    const supplierId = formData.get("supplierId");
    const orderDate = formData.get("orderDate");
    const paymentStatus = formData.get("paymentStatus");
    const paymentMethod = formData.get("paymentMethod");
    const notes = formData.get("notes") || null;
    
    // Validate required fields
    if (!supplierId || !orderDate || !paymentStatus || !paymentMethod) {
      return json({
        success: false,
        error: "Vui lòng nhập đầy đủ thông tin đơn nhập hàng",
      }, { status: 400 });
    }
    
    try {
      await db.purchaseOrder.update({
        where: {
          id: Number(purchaseOrderId),
        },
        data: {
          supplierId: Number(supplierId),
          orderDate: new Date(String(orderDate)),
          paymentStatus: String(paymentStatus),
          paymentMethod: String(paymentMethod),
          notes: notes ? String(notes) : null,
        },
      });
      
      return redirect(`/admin/purchase-orders/${purchaseOrderId}`);
    } catch (error) {
      console.error("Error updating purchase order:", error);
      return json({
        success: false,
        error: "Lỗi khi cập nhật thông tin đơn nhập hàng",
      }, { status: 500 });
    }
  }
};

export default function EditPurchaseOrder() {
  const { purchaseOrder, suppliers, products, units } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submit = useSubmit();
  
  const isLoading = navigation.state === "loading";
  
  // Product selection state
  const [selectedProductId, setSelectedProductId] = useState("");
  const [availableUnits, setAvailableUnits] = useState<any[]>([]);
  const [selectedProductUnitId, setSelectedProductUnitId] = useState("");
  const [unitCostPrice, setUnitCostPrice] = useState<number | null>(null);
  
  // Update available units when product changes
  useEffect(() => {
    if (selectedProductId) {
      const product = products.find(p => p.id === Number(selectedProductId));
      if (product) {
        setAvailableUnits(product.productUnits);
        setSelectedProductUnitId("");
        setUnitCostPrice(null);
      }
    } else {
      setAvailableUnits([]);
      setSelectedProductUnitId("");
      setUnitCostPrice(null);
    }
  }, [selectedProductId, products]);
  
  // Update cost price when unit changes
  useEffect(() => {
    if (selectedProductUnitId) {
      const product = products.find(p => p.id === Number(selectedProductId));
      if (product) {
        const productUnit = product.productUnits.find(
          pu => pu.id === Number(selectedProductUnitId)
        );
        if (productUnit) {
          setUnitCostPrice(productUnit.costPrice);
        }
      }
    }
  }, [selectedProductUnitId, selectedProductId, products]);
  
  // Format currency
  const formatCurrency = (amount: number) => {
    return amount.toLocaleString("vi-VN") + " đ";
  };
  
  // Handle item deletion
  const handleDeleteItem = (itemId: number) => {
    if (confirm("Bạn có chắc chắn muốn xóa sản phẩm này khỏi đơn nhập hàng?")) {
      const formData = new FormData();
      formData.append("_action", "delete-item");
      formData.append("itemId", itemId.toString());
      submit(formData, { method: "post" });
    }
  };
  
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Chỉnh sửa đơn nhập hàng</h1>
        <Link
          to={`/admin/purchase-orders/${purchaseOrder.id}`}
          className="bg-gray-500 hover:bg-gray-600 text-white px-3 py-2 rounded flex items-center gap-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
          </svg>
          <span>Quay lại</span>
        </Link>
      </div>
      
      {actionData?.error && (
        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-6">
          <p>{actionData.error}</p>
        </div>
      )}
      
      {actionData?.message && (
        <div className="bg-green-100 border-l-4 border-green-500 text-green-700 p-4 mb-6">
          <p>{actionData.message}</p>
        </div>
      )}
      
      <div className="bg-white shadow-md rounded-md overflow-hidden mb-6">
        <div className="p-6">
          <div className="flex justify-between mb-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-800 mb-2">
                Mã đơn: {purchaseOrder.code}
              </h2>
              <p className="text-sm text-gray-600">
                Người tạo: {purchaseOrder.user.fullName}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-600 mb-2">
                Ngày tạo: {new Date(purchaseOrder.createdAt).toLocaleDateString("vi-VN")}
              </p>
              <p className="text-lg font-semibold text-gray-800">
                Tổng tiền: {formatCurrency(purchaseOrder.totalAmount)}
              </p>
            </div>
          </div>
          
          {/* Purchase Order Information Form */}
          <Form method="post" className="mb-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div>
                <label htmlFor="supplierId" className="block text-sm font-medium text-gray-700 mb-1">
                  Nhà cung cấp <span className="text-red-500">*</span>
                </label>
                <select
                  id="supplierId"
                  name="supplierId"
                  defaultValue={purchaseOrder.supplierId}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="">Chọn nhà cung cấp</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label htmlFor="orderDate" className="block text-sm font-medium text-gray-700 mb-1">
                  Ngày nhập <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  id="orderDate"
                  name="orderDate"
                  defaultValue={purchaseOrder.orderDate}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              
              <div>
                <label htmlFor="paymentStatus" className="block text-sm font-medium text-gray-700 mb-1">
                  Trạng thái thanh toán <span className="text-red-500">*</span>
                </label>
                <select
                  id="paymentStatus"
                  name="paymentStatus"
                  defaultValue={purchaseOrder.paymentStatus}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="UNPAID">Chưa thanh toán</option>
                  <option value="PARTIAL">Thanh toán một phần</option>
                  <option value="PAID">Đã thanh toán</option>
                </select>
              </div>
              
              <div>
                <label htmlFor="paymentMethod" className="block text-sm font-medium text-gray-700 mb-1">
                  Phương thức thanh toán <span className="text-red-500">*</span>
                </label>
                <select
                  id="paymentMethod"
                  name="paymentMethod"
                  defaultValue={purchaseOrder.paymentMethod}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="CASH">Tiền mặt</option>
                  <option value="TRANSFER">Chuyển khoản</option>
                  <option value="CREDIT">Công nợ</option>
                </select>
              </div>
              
              <div className="md:col-span-2">
                <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
                  Ghi chú
                </label>
                <textarea
                  id="notes"
                  name="notes"
                  defaultValue={purchaseOrder.notes || ""}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                ></textarea>
              </div>
            </div>
            
            <div className="flex justify-end">
              <button
                type="submit"
                className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md"
                disabled={isLoading}
              >
                {isLoading ? "Đang lưu..." : "Lưu thông tin"}
              </button>
            </div>
          </Form>
          
          {/* Products List */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold mb-4">Danh sách sản phẩm</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Sản phẩm
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Đơn vị tính
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
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Lô sản xuất
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Hạn sử dụng
                    </th>
                    <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Thao tác
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {purchaseOrder.items.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {item.product.name}
                        <div className="text-xs text-gray-500">{item.product.code}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {item.productUnit.unit.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {item.quantity}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatCurrency(item.costPrice)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {formatCurrency(item.quantity * item.costPrice)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {item.batchNumber || "-"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {item.expiryDate 
                          ? new Date(item.expiryDate).toLocaleDateString("vi-VN") 
                          : "-"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          type="button"
                          onClick={() => handleDeleteItem(item.id)}
                          className="text-red-600 hover:text-red-900"
                          title="Xóa"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                  
                  {purchaseOrder.items.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-6 py-4 text-center text-sm text-gray-500">
                        Chưa có sản phẩm nào trong đơn hàng
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          
          {/* Add Product Form */}
          <div>
            <h3 className="text-lg font-semibold mb-4">Thêm sản phẩm</h3>
            <Form method="post" className="bg-gray-50 p-4 rounded-md">
              <input type="hidden" name="_action" value="add-item" />
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <label htmlFor="productId" className="block text-sm font-medium text-gray-700 mb-1">
                    Sản phẩm <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="productId"
                    name="productId"
                    value={selectedProductId}
                    onChange={(e) => setSelectedProductId(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  >
                    <option value="">Chọn sản phẩm</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name} ({product.code})
                      </option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label htmlFor="productUnitId" className="block text-sm font-medium text-gray-700 mb-1">
                    Đơn vị tính <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="productUnitId"
                    name="productUnitId"
                    value={selectedProductUnitId}
                    onChange={(e) => setSelectedProductUnitId(e.target.value)}
                    required
                    disabled={!selectedProductId}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  >
                    <option value="">Chọn đơn vị tính</option>
                    {availableUnits.map((productUnit) => (
                      <option key={productUnit.id} value={productUnit.id}>
                        {productUnit.unit.name}
                      </option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label htmlFor="quantity" className="block text-sm font-medium text-gray-700 mb-1">
                    Số lượng <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    id="quantity"
                    name="quantity"
                    min="0.01"
                    step="0.01"
                    required
                    disabled={!selectedProductUnitId}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <label htmlFor="costPrice" className="block text-sm font-medium text-gray-700 mb-1">
                    Đơn giá <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    id="costPrice"
                    name="costPrice"
                    min="0"
                    step="0.01"
                    required
                    defaultValue={unitCostPrice || ""}
                    disabled={!selectedProductUnitId}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
                
                <div>
                  <label htmlFor="batchNumber" className="block text-sm font-medium text-gray-700 mb-1">
                    Lô sản xuất
                  </label>
                  <input
                    type="text"
                    id="batchNumber"
                    name="batchNumber"
                    disabled={!selectedProductUnitId}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
                
                <div>
                  <label htmlFor="expiryDate" className="block text-sm font-medium text-gray-700 mb-1">
                    Hạn sử dụng
                  </label>
                  <input
                    type="date"
                    id="expiryDate"
                    name="expiryDate"
                    disabled={!selectedProductUnitId}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
              </div>
              
              <div className="flex justify-end">
                <button
                  type="submit"
                  className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-md flex items-center gap-2"
                  disabled={isLoading || !selectedProductUnitId}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                  </svg>
                  <span>{isLoading ? "Đang thêm..." : "Thêm sản phẩm"}</span>
                </button>
              </div>
            </Form>
          </div>
        </div>
      </div>
    </div>
  );
}
