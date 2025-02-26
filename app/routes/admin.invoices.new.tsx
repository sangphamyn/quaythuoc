import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { Form, Link, useLoaderData, useNavigation, useSubmit } from "@remix-run/react";
import { useEffect, useState } from "react";
import { db } from "~/utils/db.server";
import { getUserId } from "~/utils/session.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Get current user from session
  // This is a placeholder - implement your actual auth logic
  const userId = await getUserId(request); // Replace with actual session logic
  
  const [products, users] = await Promise.all([
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
        category: true,
      },
    }),
    db.user.findMany({
      where: {
        role: "STAFF",
      },
      orderBy: {
        fullName: "asc",
      },
    }),
  ]);
  
  // Generate invoice code
  const today = new Date();
  const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
  
  // Count existing invoices for today to generate sequential number
  const todayInvoicesCount = await db.invoice.count({
    where: {
      code: {
        startsWith: `HD${dateStr}`,
      },
    },
  });
  
  // Generate next invoice number
  const invoiceCode = `HD${dateStr}${String(todayInvoicesCount + 1).padStart(3, '0')}`;
  
  return json({
    products,
    users,
    currentUser: users.find(user => user.id === userId) || null,
    invoiceCode,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const formData = await request.formData();
  
  // Get invoice data from form
  const code = formData.get("code") as string;
  const customerName = formData.get("customerName") as string || null;
  const customerPhone = formData.get("customerPhone") as string || null;
  const userId = parseInt(formData.get("userId") as string, 10);
  const paymentMethod = formData.get("paymentMethod") as string;
  const discount = parseFloat(formData.get("discount") as string) || 0;
  const notes = formData.get("notes") as string || null;
  
  // Get invoice items from form
  const itemsData = [];
  let index = 0;
  
  while (formData.has(`items[${index}][productId]`)) {
    const productId = parseInt(formData.get(`items[${index}][productId]`) as string, 10);
    const productUnitId = parseInt(formData.get(`items[${index}][productUnitId]`) as string, 10);
    const quantity = parseFloat(formData.get(`items[${index}][quantity]`) as string);
    const unitPrice = parseFloat(formData.get(`items[${index}][unitPrice]`) as string);
    const amount = parseFloat(formData.get(`items[${index}][amount]`) as string);
    
    // Skip if any required field is missing
    if (productId && productUnitId && quantity && unitPrice) {
      itemsData.push({
        productId,
        productUnitId,
        quantity,
        unitPrice,
        amount,
      });
    }
    
    index++;
  }
  
  // Calculate total amount
  const totalAmount = itemsData.reduce((sum, item) => sum + item.amount, 0);
  const finalAmount = totalAmount - discount;
  
  // Validate
  if (!code || !userId || !paymentMethod || !itemsData.length) {
    return json(
      { success: false, error: "Vui lòng nhập đầy đủ thông tin hóa đơn" },
      { status: 400 }
    );
  }
  
  try {
    // Create invoice and items in a transaction
    const invoice = await db.$transaction(async (tx) => {
      // 1. Create invoice
      const newInvoice = await tx.invoice.create({
        data: {
          code,
          customerName,
          customerPhone,
          userId,
          invoiceDate: new Date(),
          totalAmount,
          discount,
          finalAmount,
          paymentMethod,
          status: "COMPLETED",
          notes,
        },
      });
      
      // 2. Create invoice items and update inventory
      for (const item of itemsData) {
        // Create invoice item
        await tx.invoiceItem.create({
          data: {
            invoiceId: newInvoice.id,
            productId: item.productId,
            productUnitId: item.productUnitId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            amount: item.amount,
          },
        });
        
        // Find product in inventory
        const inventoryItem = await tx.inventory.findFirst({
          where: {
            productId: item.productId,
            productUnitId: item.productUnitId,
          },
        });
        
        // If inventory exists, update quantity
        if (inventoryItem) {
          if (inventoryItem.quantity < item.quantity) {
            throw new Error(`Sản phẩm ${item.productId} không đủ tồn kho`);
          }
          
          await tx.inventory.update({
            where: {
              id: inventoryItem.id,
            },
            data: {
              quantity: inventoryItem.quantity - item.quantity,
            },
          });
        } else {
          throw new Error(`Sản phẩm ${item.productId} không có trong kho`);
        }
      }
      
      // 3. Create transaction record
      await tx.transaction.create({
        data: {
          date: new Date(),
          type: "INCOME",
          amount: finalAmount,
          description: `Thu tiền hóa đơn ${code}`,
          userId,
          relatedType: "INVOICE",
          invoiceId: newInvoice.id,
        },
      });
      
      return newInvoice;
    });
    
    // Redirect to invoice detail
    return redirect(`/admin/invoices/${invoice.id}`);
  } catch (error: any) {
    console.error("Error creating invoice:", error);
    return json(
      { success: false, error: error.message || "Lỗi khi tạo hóa đơn" },
      { status: 500 }
    );
  }
};

export default function CreateInvoice() {
  const { products, users, currentUser, invoiceCode } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const submit = useSubmit();
  
  const isLoading = navigation.state === "loading";
  
  // State for form
  const [selectedItems, setSelectedItems] = useState<any[]>([]);
  const [totalAmount, setTotalAmount] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [finalAmount, setFinalAmount] = useState(0);
  
  // Calculate totals when items or discount change
  useEffect(() => {
    const newTotalAmount = selectedItems.reduce((sum, item) => sum + (item.amount || 0), 0);
    setTotalAmount(newTotalAmount);
    setFinalAmount(newTotalAmount - discount);
  }, [selectedItems, discount]);
  
  // Add new item to the list
  const addItem = () => {
    setSelectedItems([
      ...selectedItems,
      {
        id: Date.now(), // Temporary ID for UI
        productId: "",
        productUnitId: "",
        quantity: 1,
        unitPrice: 0,
        amount: 0,
        product: null,
        productUnit: null,
      },
    ]);
  };
  
  // Remove item from the list
  const removeItem = (index: number) => {
    const updatedItems = [...selectedItems];
    updatedItems.splice(index, 1);
    setSelectedItems(updatedItems);
  };
  
  // Update item details
  const updateItem = (index: number, field: string, value: any) => {
    const updatedItems = [...selectedItems];
    const item = { ...updatedItems[index], [field]: value };
    
    // If product changes, reset unit, price and quantity
    if (field === "productId") {
      const selectedProduct = products.find(p => p.id === parseInt(value, 10));
      item.product = selectedProduct;
      item.productUnitId = "";
      item.productUnit = null;
      item.unitPrice = 0;
      item.quantity = 1;
      item.amount = 0;
    }
    
    // If unit changes, update unit price
    if (field === "productUnitId" && item.productId) {
      const selectedProduct = products.find(p => p.id === parseInt(item.productId, 10));
      const selectedUnit = selectedProduct?.productUnits.find(
        pu => pu.id === parseInt(value, 10)
      );
      
      if (selectedUnit) {
        item.productUnit = selectedUnit;
        item.unitPrice = selectedUnit.sellingPrice;
        item.amount = item.quantity * selectedUnit.sellingPrice;
      }
    }
    
    // If quantity or price changes, recalculate amount
    if (field === "quantity" || field === "unitPrice") {
      item.amount = item.quantity * item.unitPrice;
    }
    
    updatedItems[index] = item;
    setSelectedItems(updatedItems);
  };
  
  // Format currency
  const formatCurrency = (amount: number) => {
    return amount.toLocaleString("vi-VN") + " đ";
  };
  
  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Convert form to FormData
    const form = e.currentTarget as HTMLFormElement;
    const formData = new FormData(form);
    
    // Validate form data
    if (!formData.get("code") || !formData.get("userId") || !formData.get("paymentMethod")) {
      alert("Vui lòng nhập đầy đủ thông tin hóa đơn");
      return;
    }
    
    if (selectedItems.length === 0) {
      alert("Vui lòng thêm ít nhất một sản phẩm vào hóa đơn");
      return;
    }
    
    // Add items to form data
    selectedItems.forEach((item, index) => {
      formData.append(`items[${index}][productId]`, item.productId.toString());
      formData.append(`items[${index}][productUnitId]`, item.productUnitId.toString());
      formData.append(`items[${index}][quantity]`, item.quantity.toString());
      formData.append(`items[${index}][unitPrice]`, item.unitPrice.toString());
      formData.append(`items[${index}][amount]`, item.amount.toString());
    });
    
    // Submit form
    submit(formData, { method: "post" });
  };
  
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Tạo hóa đơn mới</h1>
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
      
      <div className="bg-white shadow-md rounded-md overflow-hidden mb-6">
        <div className="p-6">
          <Form method="post" onSubmit={handleSubmit}>
            {/* Invoice Information */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
              <div>
                <label htmlFor="code" className="block text-sm font-medium text-gray-700 mb-1">
                  Mã hóa đơn <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="code"
                  name="code"
                  defaultValue={invoiceCode}
                  required
                  readOnly
                  className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100"
                />
              </div>
              
              <div>
                <label htmlFor="userId" className="block text-sm font-medium text-gray-700 mb-1">
                  Nhân viên <span className="text-red-500">*</span>
                </label>
                <select
                  id="userId"
                  name="userId"
                  defaultValue={currentUser?.id || ""}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="">Chọn nhân viên</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.fullName}
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label htmlFor="paymentMethod" className="block text-sm font-medium text-gray-700 mb-1">
                  Phương thức thanh toán <span className="text-red-500">*</span>
                </label>
                <select
                  id="paymentMethod"
                  name="paymentMethod"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="CASH">Tiền mặt</option>
                  <option value="TRANSFER">Chuyển khoản</option>
                  <option value="CREDIT">Công nợ</option>
                </select>
              </div>
              
              <div>
                <label htmlFor="customerName" className="block text-sm font-medium text-gray-700 mb-1">
                  Tên khách hàng
                </label>
                <input
                  type="text"
                  id="customerName"
                  name="customerName"
                  placeholder="Để trống nếu là khách lẻ"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              
              <div>
                <label htmlFor="customerPhone" className="block text-sm font-medium text-gray-700 mb-1">
                  Số điện thoại
                </label>
                <input
                  type="text"
                  id="customerPhone"
                  name="customerPhone"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              
              <div>
                <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
                  Ghi chú
                </label>
                <input
                  type="text"
                  id="notes"
                  name="notes"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
            </div>
            
            {/* Invoice Items */}
            <div className="mb-8">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">Danh sách sản phẩm</h3>
                <button
                  type="button"
                  onClick={addItem}
                  className="bg-green-500 hover:bg-green-600 text-white px-3 py-2 rounded flex items-center gap-2"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                  </svg>
                  <span>Thêm sản phẩm</span>
                </button>
              </div>
              
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Sản phẩm <span className="text-red-500">*</span>
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Đơn vị <span className="text-red-500">*</span>
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-24">
                        Số lượng <span className="text-red-500">*</span>
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-32">
                        Đơn giá <span className="text-red-500">*</span>
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-32">
                        Thành tiền
                      </th>
                      <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-20">
                        Thao tác
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {selectedItems.map((item, index) => (
                      <tr key={item.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4">
                          <select
                            value={item.productId}
                            onChange={(e) => updateItem(index, "productId", e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md"
                            required
                          >
                            <option value="">Chọn sản phẩm</option>
                            {products.map((product) => (
                              <option key={product.id} value={product.id}>
                                {product.name} ({product.code})
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-6 py-4">
                          <select
                            value={item.productUnitId}
                            onChange={(e) => updateItem(index, "productUnitId", e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md"
                            required
                            disabled={!item.productId}
                          >
                            <option value="">Chọn đơn vị</option>
                            {item.product?.productUnits.map((productUnit: any) => (
                              <option key={productUnit.id} value={productUnit.id}>
                                {productUnit.unit.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-6 py-4">
                          <input
                            type="number"
                            value={item.quantity}
                            onChange={(e) => updateItem(index, "quantity", parseFloat(e.target.value) || 0)}
                            min="0.01"
                            step="0.01"
                            className="w-full px-3 py-2 border border-gray-300 rounded-md"
                            required
                            disabled={!item.productUnitId}
                          />
                        </td>
                        <td className="px-6 py-4">
                          <input
                            type="number"
                            value={item.unitPrice}
                            onChange={(e) => updateItem(index, "unitPrice", parseFloat(e.target.value) || 0)}
                            min="0"
                            step="0.01"
                            className="w-full px-3 py-2 border border-gray-300 rounded-md"
                            required
                            disabled={!item.productUnitId}
                          />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {formatCurrency(item.amount)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <button
                            type="button"
                            onClick={() => removeItem(index)}
                            className="text-red-600 hover:text-red-900"
                            title="Xóa"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    ))}
                    
                    {selectedItems.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-6 py-4 text-center text-sm text-gray-500">
                          Chưa có sản phẩm nào trong hóa đơn
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            
            {/* Invoice Summary */}
            <div className="flex flex-col md:flex-row justify-between items-start mb-8">
              <div className="w-full md:w-1/3 mb-4 md:mb-0">
                <div className="bg-gray-50 p-4 rounded-md">
                  <div className="mb-4">
                    <label htmlFor="discount" className="block text-sm font-medium text-gray-700 mb-1">
                      Giảm giá (VNĐ)
                    </label>
                    <input
                      type="number"
                      id="discount"
                      name="discount"
                      value={discount}
                      onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                      min="0"
                      step="1000"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    />
                  </div>
                </div>
              </div>
              
              <div className="w-full md:w-1/2">
                <div className="bg-gray-50 p-4 rounded-md">
                  <div className="flex justify-between py-2 border-b border-gray-200">
                    <span className="font-medium">Tổng tiền:</span>
                    <span>{formatCurrency(totalAmount)}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-200">
                    <span className="font-medium">Giảm giá:</span>
                    <span>{formatCurrency(discount)}</span>
                  </div>
                  <div className="flex justify-between py-2 text-lg font-bold">
                    <span>Thành tiền:</span>
                    <span>{formatCurrency(finalAmount)}</span>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Submit Button */}
            <div className="flex justify-end">
              <button
                type="submit"
                className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-md font-medium flex items-center gap-2"
                disabled={isLoading || selectedItems.length === 0}
              >
                {isLoading ? (
                  <>
                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Đang xử lý...</span>
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    <span>Tạo hóa đơn</span>
                  </>
                )}
              </button>
            </div>
          </Form>
        </div>
      </div>
    </div>
  );
}
