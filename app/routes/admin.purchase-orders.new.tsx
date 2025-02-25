import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { Form, Link, useActionData, useLoaderData, useNavigation, useSearchParams } from "@remix-run/react";
import { useEffect, useRef, useState } from "react";
import { db } from "~/utils/db.server";
import { getUserId } from "~/utils/session.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const preselectedSupplierId = url.searchParams.get("supplierId");
  
  // Load suppliers, products, and units for dropdowns
  const [suppliers, products, units] = await Promise.all([
    db.supplier.findMany({
      orderBy: { name: "asc" },
    }),
    db.product.findMany({
      include: {
        productUnits: {
          include: {
            unit: true,
          },
        },
      },
      orderBy: { name: "asc" },
    }),
    db.unit.findMany({
      orderBy: { name: "asc" },
    }),
  ]);
  
  // Generate a new order code (usually you'd have a more sophisticated system)
  const latestOrder = await db.purchaseOrder.findFirst({
    orderBy: { createdAt: "desc" },
  });
  
  const today = new Date();
  const yearMonth = `${today.getFullYear()}${(today.getMonth() + 1).toString().padStart(2, '0')}`;
  
  let nextOrderNumber = 1;
  if (latestOrder) {
    const latestCode = latestOrder.code;
    // Assuming the code format is PO-YYYYMM-XXXX
    const match = latestCode.match(/PO-\d{6}-(\d+)/);
    if (match && match[1]) {
      nextOrderNumber = parseInt(match[1], 10) + 1;
    }
  }
  
  const suggestedOrderCode = `PO-${yearMonth}-${nextOrderNumber.toString().padStart(4, '0')}`;
  
  return json({
    suppliers,
    products,
    units,
    preselectedSupplierId: preselectedSupplierId ? Number(preselectedSupplierId) : null,
    suggestedOrderCode,
    currentDate: today.toISOString().split('T')[0], // Format as YYYY-MM-DD for date input
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const formData = await request.formData();
  
  // Get the purchase order details
  const code = formData.get("code")?.toString().trim();
  const supplierId = formData.get("supplierId");
  const orderDate = formData.get("orderDate");
  const paymentMethod = formData.get("paymentMethod");
  const paymentStatus = formData.get("paymentStatus");
  const notes = formData.get("notes")?.toString().trim();
  
  // Simulate getting the current user from session
  // In a real app, you would get this from the authentication system
  const currentUserId = await getUserId(request);; // Placeholder for the actual user ID
  
  // Get product items from the form
  const productIds = formData.getAll("productId");
  const productUnitIds = formData.getAll("productUnitId");
  const quantities = formData.getAll("quantity");
  const costPrices = formData.getAll("costPrice");
  const expiryDates = formData.getAll("expiryDate");
  const batchNumbers = formData.getAll("batchNumber");
  
  // Validate basic information
  const errors: Record<string, string> = {};
  
  if (!code) {
    errors.code = "Mã đơn nhập hàng là bắt buộc";
  }
  
  if (!supplierId) {
    errors.supplierId = "Nhà cung cấp là bắt buộc";
  }
  
  if (!orderDate) {
    errors.orderDate = "Ngày nhập hàng là bắt buộc";
  }
  
  if (!paymentMethod) {
    errors.paymentMethod = "Phương thức thanh toán là bắt buộc";
  }
  
  if (!paymentStatus) {
    errors.paymentStatus = "Trạng thái thanh toán là bắt buộc";
  }
  
  // Validate items
  const itemErrors: Record<string, Record<string, string>> = {};
  let hasItemErrors = false;
  
  const items = productIds.map((_, index) => {
    const productId = productIds[index]?.toString();
    const productUnitId = productUnitIds[index]?.toString();
    const quantity = quantities[index]?.toString();
    const costPrice = costPrices[index]?.toString();
    const expiryDate = expiryDates[index]?.toString();
    const batchNumber = batchNumbers[index]?.toString();
    
    const itemError: Record<string, string> = {};
    
    if (!productId) {
      itemError.productId = "Sản phẩm là bắt buộc";
      hasItemErrors = true;
    }
    
    if (!productUnitId) {
      itemError.productUnitId = "Đơn vị tính là bắt buộc";
      hasItemErrors = true;
    }
    
    if (!quantity) {
      itemError.quantity = "Số lượng là bắt buộc";
      hasItemErrors = true;
    } else {
      const quantityValue = parseFloat(quantity);
      if (isNaN(quantityValue) || quantityValue <= 0) {
        itemError.quantity = "Số lượng phải là số dương";
        hasItemErrors = true;
      }
    }
    
    if (!costPrice) {
      itemError.costPrice = "Giá nhập là bắt buộc";
      hasItemErrors = true;
    } else {
      const costPriceValue = parseFloat(costPrice);
      if (isNaN(costPriceValue) || costPriceValue < 0) {
        itemError.costPrice = "Giá nhập không hợp lệ";
        hasItemErrors = true;
      }
    }
    
    if (Object.keys(itemError).length > 0) {
      itemErrors[index] = itemError;
    }
    
    return {
      productId,
      productUnitId,
      quantity: quantity ? parseFloat(quantity) : 0,
      costPrice: costPrice ? parseFloat(costPrice) : 0,
      expiryDate: expiryDate || null,
      batchNumber: batchNumber || null,
    };
  });
  
  // Check if we have any items at all
  if (items.length === 0) {
    errors.items = "Đơn nhập hàng phải có ít nhất một sản phẩm";
  }
  
  // Calculate total amount
  const totalAmount = items.reduce((sum, item) => sum + (item.quantity * item.costPrice), 0);
  
  // If we have errors, return them along with the form values
  if (Object.keys(errors).length > 0 || hasItemErrors) {
    return json({
      errors,
      itemErrors,
      values: {
        code,
        supplierId: supplierId ? Number(supplierId) : undefined,
        orderDate,
        paymentMethod,
        paymentStatus,
        notes,
        items,
      }
    });
  }
  
  // Check if the code already exists
  const existingOrder = await db.purchaseOrder.findUnique({
    where: { code: code as string },
  });
  
  if (existingOrder) {
    errors.code = "Mã đơn nhập hàng đã tồn tại";
    return json({
      errors,
      itemErrors,
      values: {
        code,
        supplierId: supplierId ? Number(supplierId) : undefined,
        orderDate,
        paymentMethod,
        paymentStatus,
        notes,
        items,
      }
    });
  }
  
  // Start a transaction to ensure data consistency
  try {
    const result = await db.$transaction(async (tx) => {
      // 1. Create the purchase order
      const newOrder = await tx.purchaseOrder.create({
        data: {
          code: code as string,
          supplierId: Number(supplierId),
          userId: currentUserId,
          orderDate: new Date(orderDate as string),
          totalAmount,
          paymentStatus: paymentStatus as string,
          paymentMethod: paymentMethod as string,
          notes: notes || null,
        },
      });
      
      // 2. Create purchase order items
      for (const item of items) {
        await tx.purchaseOrderItem.create({
          data: {
            purchaseOrderId: newOrder.id,
            productId: Number(item.productId),
            productUnitId: Number(item.productUnitId),
            quantity: item.quantity,
            costPrice: item.costPrice,
            expiryDate: item.expiryDate ? new Date(item.expiryDate) : null,
            batchNumber: item.batchNumber,
          },
        });
        
        // 3. Update inventory for each item
        // First, check if there's an existing inventory record
        const existingInventory = await tx.inventory.findFirst({
          where: {
            productId: Number(item.productId),
            productUnitId: Number(item.productUnitId),
            batchNumber: item.batchNumber,
            expiryDate: item.expiryDate ? new Date(item.expiryDate) : null,
          },
        });
        
        if (existingInventory) {
          // Update existing inventory
          await tx.inventory.update({
            where: { id: existingInventory.id },
            data: { quantity: existingInventory.quantity + item.quantity },
          });
        } else {
          // Create new inventory record
          await tx.inventory.create({
            data: {
              productId: Number(item.productId),
              productUnitId: Number(item.productUnitId),
              quantity: item.quantity,
              batchNumber: item.batchNumber,
              expiryDate: item.expiryDate ? new Date(item.expiryDate) : null,
            },
          });
        }
      }
      
      // 4. If payment status is PAID or PARTIAL, create a transaction record
      if (paymentStatus === "PAID" || paymentStatus === "PARTIAL") {
        // Determine payment amount (full for PAID, partial for PARTIAL)
        const paymentAmount = paymentStatus === "PAID" ? totalAmount : totalAmount / 2; // Just an example, normally this would be user input
        
        await tx.transaction.create({
          data: {
            date: new Date(),
            type: "EXPENSE",
            amount: paymentAmount,
            description: `Thanh toán ${paymentStatus === "PAID" ? "đầy đủ" : "một phần"} cho đơn nhập hàng ${code}`,
            userId: currentUserId,
            relatedType: "PURCHASE",
            purchaseOrderId: newOrder.id,
          },
        });
      }
      
      return newOrder;
    });
    
    return redirect(`/admin/purchase-orders/${result.id}`);
  } catch (error) {
    console.error("Error creating purchase order:", error);
    return json({
      errors: { _form: "Đã xảy ra lỗi khi tạo đơn nhập hàng. Vui lòng thử lại." },
      itemErrors,
      values: {
        code,
        supplierId: supplierId ? Number(supplierId) : undefined,
        orderDate,
        paymentMethod,
        paymentStatus,
        notes,
        items,
      }
    });
  }
};

export default function NewPurchaseOrder() {
  const { 
    suppliers, 
    products, 
    units,
    preselectedSupplierId,
    suggestedOrderCode,
    currentDate
  } = useLoaderData<typeof loader>();
  
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  
  const [searchParams] = useSearchParams();
  
  // Form refs
  const codeRef = useRef<HTMLInputElement>(null);
  const supplierRef = useRef<HTMLSelectElement>(null);
  
  // State for dynamic product rows
  const [productRows, setProductRows] = useState<Array<{
    id: string;
    productId: string | null;
    productUnitId: string | null;
  }>>([{ id: "0", productId: null, productUnitId: null }]);
  
  // State to track the total amount
  const [totalAmount, setTotalAmount] = useState(0);
  
  // Function to add a new product row
  const addProductRow = () => {
    setProductRows([
      ...productRows,
      { id: Date.now().toString(), productId: null, productUnitId: null }
    ]);
  };
  
  // Function to remove a product row
  const removeProductRow = (id: string) => {
    if (productRows.length > 1) {
      setProductRows(productRows.filter(row => row.id !== id));
    }
  };
  
  // Effect to set focus on first error
  useEffect(() => {
    if (actionData?.errors?.code) {
      codeRef.current?.focus();
    } else if (actionData?.errors?.supplierId) {
      supplierRef.current?.focus();
    }
  }, [actionData]);
  
  // Function to calculate total amount
  const calculateTotal = () => {
    const form = document.querySelector("form");
    if (!form) return;
    
    const formData = new FormData(form);
    const quantities = formData.getAll("quantity");
    const costPrices = formData.getAll("costPrice");
    
    let total = 0;
    for (let i = 0; i < quantities.length; i++) {
      const quantity = parseFloat(quantities[i]?.toString() || "0");
      const costPrice = parseFloat(costPrices[i]?.toString() || "0");
      
      if (!isNaN(quantity) && !isNaN(costPrice)) {
        total += quantity * costPrice;
      }
    }
    
    setTotalAmount(total);
  };
  
  // Handle product selection to populate unit options
  const handleProductChange = (rowId: string, productId: string) => {
    setProductRows(
      productRows.map(row => 
        row.id === rowId ? { ...row, productId, productUnitId: null } : row
      )
    );
  };
  
  // Get available units for a product
  const getProductUnits = (productId: string | null) => {
    if (!productId) return [];
    
    const product = products.find(p => p.id.toString() === productId);
    return product ? product.productUnits : [];
  };
  
  // Find default cost price for a product unit
  const getDefaultCostPrice = (productId: string | null, productUnitId: string | null) => {
    if (!productId || !productUnitId) return "";
    
    const product = products.find(p => p.id.toString() === productId);
    if (!product) return "";
    
    const productUnit = product.productUnits.find(pu => pu.id.toString() === productUnitId);
    return productUnit ? productUnit.costPrice.toString() : "";
  };
  
  // Format currency
  const formatCurrency = (amount: number) => {
    return amount.toLocaleString("vi-VN") + " đ";
  };
  
  return (
    <div className="container mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Tạo đơn nhập hàng mới</h1>
        <Link
          to="/admin/purchase-orders"
          className="px-4 py-2 bg-gray-100 text-gray-800 rounded-md hover:bg-gray-200 flex items-center gap-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
          </svg>
          <span>Quay lại</span>
        </Link>
      </div>
      
      {actionData?.errors?._form && (
        <div className="mb-6 p-4 border border-red-200 bg-red-50 text-red-700 rounded-md">
          {actionData.errors._form}
        </div>
      )}
      
      <Form method="post" onChange={calculateTotal} className="space-y-6">
        {/* Purchase order details */}
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-lg font-semibold mb-4">Thông tin đơn nhập hàng</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
            {/* Order code */}
            <div>
              <label htmlFor="code" className="block text-sm font-medium text-gray-700 mb-1">
                Mã đơn nhập hàng <span className="text-red-500">*</span>
              </label>
              <input
                ref={codeRef}
                type="text"
                id="code"
                name="code"
                defaultValue={actionData?.values?.code || suggestedOrderCode}
                className={`w-full px-3 py-2 border rounded-md ${
                  actionData?.errors?.code
                    ? "border-red-500 focus:outline-red-500"
                    : "border-gray-300 focus:outline-blue-500"
                }`}
                placeholder="Nhập mã đơn hàng"
              />
              {actionData?.errors?.code && (
                <p className="text-red-500 text-sm mt-1">{actionData.errors.code}</p>
              )}
            </div>
            
            {/* Supplier */}
            <div>
              <label htmlFor="supplierId" className="block text-sm font-medium text-gray-700 mb-1">
                Nhà cung cấp <span className="text-red-500">*</span>
              </label>
              <select
                ref={supplierRef}
                id="supplierId"
                name="supplierId"
                defaultValue={actionData?.values?.supplierId || preselectedSupplierId || ""}
                className={`w-full px-3 py-2 border rounded-md appearance-none bg-white ${
                  actionData?.errors?.supplierId
                    ? "border-red-500 focus:outline-red-500"
                    : "border-gray-300 focus:outline-blue-500"
                }`}
              >
                <option value="">-- Chọn nhà cung cấp --</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
              {actionData?.errors?.supplierId && (
                <p className="text-red-500 text-sm mt-1">{actionData.errors.supplierId}</p>
              )}
            </div>
            
            {/* Order date */}
            <div>
              <label htmlFor="orderDate" className="block text-sm font-medium text-gray-700 mb-1">
                Ngày nhập hàng <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                id="orderDate"
                name="orderDate"
                defaultValue={actionData?.values?.orderDate || currentDate}
                className={`w-full px-3 py-2 border rounded-md ${
                  actionData?.errors?.orderDate
                    ? "border-red-500 focus:outline-red-500"
                    : "border-gray-300 focus:outline-blue-500"
                }`}
              />
              {actionData?.errors?.orderDate && (
                <p className="text-red-500 text-sm mt-1">{actionData.errors.orderDate}</p>
              )}
            </div>
            
            {/* Payment method */}
            <div>
              <label htmlFor="paymentMethod" className="block text-sm font-medium text-gray-700 mb-1">
                Phương thức thanh toán <span className="text-red-500">*</span>
              </label>
              <select
                id="paymentMethod"
                name="paymentMethod"
                defaultValue={actionData?.values?.paymentMethod || "CASH"}
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
            
            {/* Payment status */}
            <div>
              <label htmlFor="paymentStatus" className="block text-sm font-medium text-gray-700 mb-1">
                Trạng thái thanh toán <span className="text-red-500">*</span>
              </label>
              <select
                id="paymentStatus"
                name="paymentStatus"
                defaultValue={actionData?.values?.paymentStatus || "UNPAID"}
                className={`w-full px-3 py-2 border rounded-md appearance-none bg-white ${
                  actionData?.errors?.paymentStatus
                    ? "border-red-500 focus:outline-red-500"
                    : "border-gray-300 focus:outline-blue-500"
                }`}
              >
                <option value="UNPAID">Chưa thanh toán</option>
                <option value="PARTIAL">Thanh toán một phần</option>
                <option value="PAID">Đã thanh toán đầy đủ</option>
              </select>
              {actionData?.errors?.paymentStatus && (
                <p className="text-red-500 text-sm mt-1">{actionData.errors.paymentStatus}</p>
              )}
            </div>
            
            {/* Notes */}
            <div className="md:col-span-2 lg:col-span-3">
              <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
                Ghi chú
              </label>
              <textarea
                id="notes"
                name="notes"
                defaultValue={actionData?.values?.notes || ""}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-blue-500"
                placeholder="Nhập ghi chú (không bắt buộc)"
                rows={3}
              />
            </div>
          </div>
        </div>
        
        {/* Product items */}
        <div className="bg-white p-6 rounded-lg shadow-md">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">Chi tiết sản phẩm</h2>
            <button
              type="button"
              onClick={addProductRow}
              className="px-3 py-1 bg-green-500 text-white rounded-md hover:bg-green-600 flex items-center gap-1"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
              </svg>
              <span>Thêm sản phẩm</span>
            </button>
          </div>
          
          {actionData?.errors?.items && (
            <div className="mb-4 p-3 border border-red-200 bg-red-50 text-red-700 rounded-md">
              {actionData.errors.items}
            </div>
          )}
          
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    STT
                  </th>
                  <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Sản phẩm <span className="text-red-500">*</span>
                  </th>
                  <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Đơn vị <span className="text-red-500">*</span>
                  </th>
                  <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Số lượng <span className="text-red-500">*</span>
                  </th>
                  <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Giá nhập <span className="text-red-500">*</span>
                  </th>
                  <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Thành tiền
                  </th>
                  <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Lô
                  </th>
                  <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Hạn SD
                  </th>
                  <th scope="col" className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Thao tác
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {productRows.map((row, index) => {
                  const itemErrors = actionData?.itemErrors?.[index] || {};
                  const defaultValues = actionData?.values?.items?.[index] || {};
                  
                  return (
                    <tr key={row.id}>
                      <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">
                        {index + 1}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <select
                          name="productId"
                          value={row.productId || defaultValues.productId || ""}
                          onChange={(e) => handleProductChange(row.id, e.target.value)}
                          className={`w-full px-2 py-1 border rounded-md text-sm appearance-none bg-white ${
                            itemErrors.productId
                              ? "border-red-500 focus:outline-red-500"
                              : "border-gray-300 focus:outline-blue-500"
                          }`}
                        >
                          <option value="">-- Chọn sản phẩm --</option>
                          {products.map((product) => (
                            <option key={product.id} value={product.id}>
                              {product.code} - {product.name}
                            </option>
                          ))}
                        </select>
                        {itemErrors.productId && (
                          <p className="text-red-500 text-xs mt-1">{itemErrors.productId}</p>
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <select
                          name="productUnitId"
                          value={row.productUnitId || defaultValues.productUnitId || ""}
                          onChange={(e) => 
                            setProductRows(
                              productRows.map(r => 
                                r.id === row.id ? { ...r, productUnitId: e.target.value } : r
                              )
                            )
                          }
                          className={`w-full px-2 py-1 border rounded-md text-sm appearance-none bg-white ${
                            itemErrors.productUnitId
                              ? "border-red-500 focus:outline-red-500"
                              : "border-gray-300 focus:outline-blue-500"
                          }`}
                          disabled={!row.productId}
                        >
                          <option value="">-- Chọn đơn vị --</option>
                          {getProductUnits(row.productId).map((pu) => (
                            <option key={pu.id} value={pu.id}>
                              {pu.unit.name}
                            </option>
                          ))}
                        </select>
                        {itemErrors.productUnitId && (
                          <p className="text-red-500 text-xs mt-1">{itemErrors.productUnitId}</p>
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <input
                          type="number"
                          name="quantity"
                          min="0.001"
                          step="0.001"
                          defaultValue={defaultValues.quantity || ""}
                          className={`w-full px-2 py-1 border rounded-md text-sm ${
                            itemErrors.quantity
                              ? "border-red-500 focus:outline-red-500"
                              : "border-gray-300 focus:outline-blue-500"
                          }`}
                          placeholder="Số lượng"
                        />
                        {itemErrors.quantity && (
                          <p className="text-red-500 text-xs mt-1">{itemErrors.quantity}</p>
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <input
                          type="number"
                          name="costPrice"
                          min="0"
                          step="100"
                          defaultValue={
                            defaultValues.costPrice || 
                            getDefaultCostPrice(row.productId, row.productUnitId)
                          }
                          className={`w-full px-2 py-1 border rounded-md text-sm ${
                            itemErrors.costPrice
                              ? "border-red-500 focus:outline-red-500"
                              : "border-gray-300 focus:outline-blue-500"
                          }`}
                          placeholder="Giá nhập"
                        />
                        {itemErrors.costPrice && (
                          <p className="text-red-500 text-xs mt-1">{itemErrors.costPrice}</p>
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">
                        {/* This will be calculated dynamically */}
                        {/* It's just a display field, not a form input */}
                        <div className="h-9 flex items-center">
                          {
                            (defaultValues.quantity && defaultValues.costPrice) 
                              ? formatCurrency(defaultValues.quantity * defaultValues.costPrice)
                              : ""
                          }
                        </div>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <input
                          type="text"
                          name="batchNumber"
                          defaultValue={defaultValues.batchNumber || ""}
                          className="w-full px-2 py-1 border border-gray-300 rounded-md text-sm focus:outline-blue-500"
                          placeholder="Số lô"
                        />
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <input
                          type="date"
                          name="expiryDate"
                          defaultValue={defaultValues.expiryDate || ""}
                          className="w-full px-2 py-1 border border-gray-300 rounded-md text-sm focus:outline-blue-500"
                        />
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-right">
                        <button
                          type="button"
                          onClick={() => removeProductRow(row.id)}
                          disabled={productRows.length === 1}
                          className={`p-1 text-red-600 hover:text-red-900 ${
                            productRows.length === 1 ? "opacity-50 cursor-not-allowed" : ""
                          }`}
                          title="Xóa sản phẩm"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-gray-50 font-medium">
                <tr>
                  <td colSpan={5} className="px-3 py-3 text-right text-sm text-gray-900">
                    Tổng cộng:
                  </td>
                  <td className="px-3 py-3 text-sm text-gray-900">
                    {formatCurrency(totalAmount)}
                  </td>
                  <td colSpan={3}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
        
        {/* Submission buttons */}
        <div className="flex justify-end gap-2">
          <Link
            to="/admin/purchase-orders"
            className="px-4 py-2 bg-gray-100 text-gray-800 rounded-md hover:bg-gray-200 flex items-center gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
            <span>Hủy</span>
          </Link>
          <button
            type="submit"
            disabled={isSubmitting}
            className={`px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 flex items-center gap-2 ${
              isSubmitting ? "opacity-70 cursor-not-allowed" : ""
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
            <span>{isSubmitting ? "Đang xử lý..." : "Tạo đơn nhập hàng"}</span>
          </button>
        </div>
      </Form>
    </div>
  );
}
