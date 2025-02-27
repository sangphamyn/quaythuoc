import { useState, useEffect, useRef } from "react";
import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { Form, useLoaderData, useActionData, useSubmit, useNavigation } from "@remix-run/react";
import { db } from "~/utils/db.server";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { requireUserId } from "~/utils/session.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Đảm bảo người dùng đã đăng nhập và là nhân viên
  const userId = await requireUserId(request);
  
  // Lấy thông tin người dùng
  const user = await db.user.findUnique({
    where: { id: userId },
  });
  
  if (!user || (user.role !== "ADMIN" && user.role !== "STAFF")) {
    return redirect("/login");
  }
  
  // Lấy danh sách sản phẩm
  const products = await db.product.findMany({
    include: {
      category: true,
      usageRoute: true,
      productUnits: {
        include: {
          unit: true,
        },
      },
      inventoryItems: {
        include: {
          productUnit: {
            include: {
              unit: true,
            },
          },
        },
      },
    },
    orderBy: {
      name: "asc",
    },
  });
  
  // Lấy danh sách danh mục
  const categories = await db.category.findMany({
    where: { parentId: null },
    include: {
      subcategories: true,
    },
    orderBy: {
      name: "asc",
    },
  });
  
  // Lấy mã hóa đơn mới
  const today = new Date();
  const dateStr = format(today, "yyMMdd");
  
  const lastInvoice = await db.invoice.findFirst({
    where: {
      code: {
        startsWith: `HD${dateStr}`,
      },
    },
    orderBy: {
      code: "desc",
    },
  });
  
  let nextInvoiceCode = `HD${dateStr}0001`;
  
  if (lastInvoice) {
    const lastCodeNumber = parseInt(lastInvoice.code.slice(-4));
    nextInvoiceCode = `HD${dateStr}${String(lastCodeNumber + 1).padStart(4, "0")}`;
  }
  
  const paymentMethods = [
    { value: "CASH", label: "Tiền mặt" },
    { value: "TRANSFER", label: "Chuyển khoản" },
    { value: "CREDIT", label: "Công nợ" },
  ];
  
  return json({
    products: products.map(product => ({
      id: product.id,
      code: product.code,
      name: product.name,
      categoryId: product.categoryId,
      categoryName: product.category.name,
      usageRoute: product.usageRoute?.name || "",
      units: product.productUnits.map(pu => ({
        id: pu.id,
        productId: pu.productId,
        unitId: pu.unitId,
        unitName: pu.unit.name,
        conversionFactor: pu.conversionFactor,
        costPrice: pu.costPrice,
        sellingPrice: pu.sellingPrice,
        isBaseUnit: pu.isBaseUnit,
      })),
      inventory: product.inventoryItems.map(item => ({
        id: item.id,
        productId: item.productId,
        unitId: item.productUnitId,
        unitName: item.productUnit.unit.name,
        quantity: item.quantity,
        batchNumber: item.batchNumber || "",
        expiryDate: item.expiryDate ? format(item.expiryDate, "yyyy-MM-dd") : null,
      })),
    })),
    categories,
    nextInvoiceCode,
    paymentMethods,
    user: {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
    },
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const userId = await requireUserId(request);
  const formData = await request.formData();
  const action = formData.get("action");
  
  if (action === "create-invoice") {
    const invoiceData = {
      code: formData.get("invoiceCode") as string,
      customerName: formData.get("customerName") as string,
      customerPhone: formData.get("customerPhone") as string,
      userId: userId,
      invoiceDate: new Date(),
      totalAmount: parseFloat(formData.get("totalAmount") as string),
      discount: parseFloat(formData.get("discount") as string || "0"),
      finalAmount: parseFloat(formData.get("finalAmount") as string),
      paymentMethod: formData.get("paymentMethod") as "CASH" | "TRANSFER" | "CREDIT",
      status: "COMPLETED",
      notes: formData.get("notes") as string || "",
    };
    
    // Đọc danh sách sản phẩm
    const itemsJson = formData.get("items") as string;
    const items = JSON.parse(itemsJson);
    
    // Tạo hóa đơn trong transaction
    const result = await db.$transaction(async (tx) => {
      // Tạo hóa đơn
      const invoice = await tx.invoice.create({
        data: {
          ...invoiceData,
          items: {
            create: items.map((item: any) => ({
              productId: item.productId,
              productUnitId: item.unitId,
              quantity: item.quantity,
              unitPrice: item.price,
              amount: item.amount,
            })),
          },
        },
      });
      
      // Cập nhật tồn kho
      for (const item of items) {
        // Tìm mục tồn kho phù hợp
        const inventoryItem = await tx.inventory.findFirst({
          where: {
            productId: item.productId,
            productUnitId: item.unitId,
            batchNumber: item.batchNumber || null,
            expiryDate: item.expiryDate ? new Date(item.expiryDate) : null,
          },
        });
        
        if (inventoryItem) {
          // Cập nhật số lượng
          await tx.inventory.update({
            where: { id: inventoryItem.id },
            data: { quantity: inventoryItem.quantity - item.quantity },
          });
        } else {
          throw new Error(`Không tìm thấy tồn kho phù hợp cho sản phẩm ${item.productId}`);
        }
      }
      
      // Tạo giao dịch thu tiền
      await tx.transaction.create({
        data: {
          date: new Date(),
          type: "INCOME",
          amount: invoiceData.finalAmount,
          description: `Thu tiền hóa đơn ${invoiceData.code}`,
          userId: userId,
          relatedId: invoice.id,
          relatedType: "INVOICE",
          invoiceId: invoice.id,
        },
      });
      
      return invoice;
    });
    
    return json({ success: true, invoiceId: result.id });
  }
  
  return json({ success: false, error: "Hành động không hợp lệ" });
};

export default function SalesPage() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const navigation = useNavigation();
  
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [filteredProducts, setFilteredProducts] = useState(loaderData.products);
  const [cart, setCart] = useState<any[]>([]);
  const [customer, setCustomer] = useState({ name: "", phone: "" });
  const [discount, setDiscount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [notes, setNotes] = useState("");
  
  const searchInputRef = useRef<HTMLInputElement>(null);
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  
  // Tính toán tổng tiền
  const subtotal = cart.reduce((sum, item) => sum + item.amount, 0);
  const finalAmount = subtotal - discount;
  
  // Lọc sản phẩm khi tìm kiếm hoặc chọn danh mục
  useEffect(() => {
    let filtered = loaderData.products;
    
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        product =>
          product.name.toLowerCase().includes(query) ||
          product.code.toLowerCase().includes(query)
      );
    }
    
    if (selectedCategory !== null) {
      filtered = filtered.filter(product => product.categoryId === selectedCategory);
    }
    
    setFilteredProducts(filtered);
  }, [searchQuery, selectedCategory, loaderData.products]);
  
  // Xử lý khi nhập mã vạch
  const handleBarcodeInput = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const barcode = barcodeInputRef.current?.value.trim();
      
      if (barcode) {
        // Tìm sản phẩm theo mã
        const product = loaderData.products.find(p => p.code === barcode);
        
        if (product) {
          addToCart(product, product.units[0]);
          barcodeInputRef.current.value = "";
        }
      }
    }
  };
  
  // Thêm sản phẩm vào giỏ hàng
  const addToCart = (product: any, unit: any) => {
    // Kiểm tra số lượng tồn kho
    const inventoryItem = product.inventory.find(
      (item: any) => item.unitId === unit.id
    );
    
    if (!inventoryItem || inventoryItem.quantity <= 0) {
      alert("Sản phẩm đã hết hàng");
      return;
    }
    
    // Tạo mục giỏ hàng mới
    const newItem = {
      id: Date.now(),
      productId: product.id,
      productCode: product.code,
      productName: product.name,
      unitId: unit.id,
      unitName: unit.unitName,
      price: unit.sellingPrice,
      quantity: 1,
      amount: unit.sellingPrice,
      batchNumber: inventoryItem.batchNumber,
      expiryDate: inventoryItem.expiryDate,
      maxQuantity: inventoryItem.quantity,
    };
    
    // Kiểm tra nếu sản phẩm đã có trong giỏ hàng
    const existingItemIndex = cart.findIndex(
      item => 
        item.productId === product.id && 
        item.unitId === unit.id &&
        item.batchNumber === inventoryItem.batchNumber &&
        item.expiryDate === inventoryItem.expiryDate
    );
    
    if (existingItemIndex >= 0) {
      // Cập nhật số lượng
      const updatedCart = [...cart];
      const existingItem = updatedCart[existingItemIndex];
      
      if (existingItem.quantity < inventoryItem.quantity) {
        existingItem.quantity += 1;
        existingItem.amount = existingItem.quantity * existingItem.price;
        setCart(updatedCart);
      } else {
        alert("Số lượng trong kho không đủ");
      }
    } else {
      // Thêm mục mới
      setCart([...cart, newItem]);
    }
  };
  
  // Cập nhật số lượng sản phẩm trong giỏ hàng
  const updateCartItemQuantity = (itemId: number, newQuantity: number) => {
    const updatedCart = cart.map(item => {
      if (item.id === itemId) {
        if (newQuantity > item.maxQuantity) {
          alert("Số lượng trong kho không đủ");
          return item;
        }
        
        return {
          ...item,
          quantity: newQuantity,
          amount: newQuantity * item.price,
        };
      }
      return item;
    });
    
    setCart(updatedCart);
  };
  
  // Xóa sản phẩm khỏi giỏ hàng
  const removeFromCart = (itemId: number) => {
    setCart(cart.filter(item => item.id !== itemId));
  };
  
  // Xử lý khi thanh toán
  const handleCheckout = () => {
    if (cart.length === 0) {
      alert("Vui lòng thêm sản phẩm vào giỏ hàng");
      return;
    }
    
    // Tạo form data để submit
    const formData = new FormData();
    formData.append("action", "create-invoice");
    formData.append("invoiceCode", loaderData.nextInvoiceCode);
    formData.append("customerName", customer.name);
    formData.append("customerPhone", customer.phone);
    formData.append("totalAmount", subtotal.toString());
    formData.append("discount", discount.toString());
    formData.append("finalAmount", finalAmount.toString());
    formData.append("paymentMethod", paymentMethod);
    formData.append("notes", notes);
    formData.append("items", JSON.stringify(cart));
    
    submit(formData, { method: "post" });
  };
  
  // Xử lý khi đơn hàng được tạo thành công
  useEffect(() => {
    if (actionData?.success) {
      setShowSuccessModal(true);
      // Reset form
      setCart([]);
      setCustomer({ name: "", phone: "" });
      setDiscount(0);
      setNotes("");
      setPaymentMethod("CASH");
    }
  }, [actionData]);
  
  // Focus vào ô tìm kiếm khi trang được tải
  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);
  
  return (
    <div className="flex h-screen bg-gray-100">
      {/* Thanh bên trái - Danh sách sản phẩm */}
      <div className="w-2/3 p-4 overflow-hidden flex flex-col">
        <div className="bg-white rounded-lg shadow p-4 mb-4">
          <div className="flex flex-col md:flex-row gap-3 mb-4">
            <div className="flex-1">
              <div className="relative">
                <input
                  type="text"
                  ref={searchInputRef}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Tìm kiếm sản phẩm..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <svg
                  className="absolute right-3 top-2.5 h-5 w-5 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </div>
            </div>
            <div className="w-full md:w-1/3">
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                value={selectedCategory || ""}
                onChange={(e) => setSelectedCategory(e.target.value ? parseInt(e.target.value) : null)}
              >
                <option value="">Tất cả danh mục</option>
                {loaderData.categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-full md:w-1/3">
              <div className="relative">
                <input
                  type="text"
                  ref={barcodeInputRef}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Quét mã vạch..."
                  onKeyDown={handleBarcodeInput}
                />
                <svg
                  className="absolute right-3 top-2.5 h-5 w-5 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
                  />
                </svg>
              </div>
            </div>
          </div>
          
          <div className="flex flex-wrap -mx-2">
            {filteredProducts.length === 0 ? (
              <div className="w-full p-6 text-center text-gray-500">
                Không tìm thấy sản phẩm
              </div>
            ) : (
              filteredProducts.map((product) => (
                <div key={product.id} className="w-1/2 lg:w-1/3 xl:w-1/4 p-2">
                  <div className="bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow">
                    <div className="p-3">
                      <h3 className="text-sm font-medium text-gray-900 truncate mb-1" title={product.name}>
                        {product.name}
                      </h3>
                      <p className="text-xs text-gray-500 mb-2">
                        {product.code} - {product.categoryName}
                      </p>
                      
                      <div className="flex justify-between items-center">
                        <div className="text-sm font-semibold text-blue-600">
                          {product.units.length > 0
                            ? new Intl.NumberFormat("vi-VN").format(product.units[0].sellingPrice) + " đ"
                            : "Chưa có giá"}
                        </div>
                        
                        <div className="flex space-x-1">
                          {product.units.map((unit) => (
                            <button
                              key={unit.id}
                              className="px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded hover:bg-blue-100"
                              onClick={() => addToCart(product, unit)}
                            >
                              {unit.unitName}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
      
      {/* Thanh bên phải - Giỏ hàng */}
      <div className="w-1/3 bg-white shadow-lg p-4 flex flex-col h-full">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">Hóa đơn - {loaderData.nextInvoiceCode}</h2>
          <div className="text-sm text-gray-500">
            {format(new Date(), "dd/MM/yyyy HH:mm", { locale: vi })}
          </div>
        </div>
        
        <div className="border-b border-gray-200 pb-4 mb-4">
          <div className="flex mb-2">
            <div className="w-1/2 pr-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tên khách hàng
              </label>
              <input
                type="text"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                value={customer.name}
                onChange={(e) => setCustomer({ ...customer, name: e.target.value })}
              />
            </div>
            <div className="w-1/2 pl-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Số điện thoại
              </label>
              <input
                type="text"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                value={customer.phone}
                onChange={(e) => setCustomer({ ...customer, phone: e.target.value })}
              />
            </div>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto mb-4">
          {cart.length === 0 ? (
            <div className="text-center text-gray-500 py-6">
              Chưa có sản phẩm nào trong giỏ hàng
            </div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Sản phẩm
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    SL
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Đơn giá
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Thành tiền
                  </th>
                  <th className="px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider"></th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {cart.map((item) => (
                  <tr key={item.id}>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {item.productName}
                      </div>
                      <div className="text-xs text-gray-500">
                        {item.unitName}
                      </div>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-right">
                      <input
                        type="number"
                        min="1"
                        max={item.maxQuantity}
                        className="w-16 px-2 py-1 text-right border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                        value={item.quantity}
                        onChange={(e) => updateCartItemQuantity(item.id, parseInt(e.target.value) || 1)}
                      />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-right">
                      {new Intl.NumberFormat("vi-VN").format(item.price)}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm font-medium text-right">
                      {new Intl.NumberFormat("vi-VN").format(item.amount)}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        type="button"
                        className="text-red-600 hover:text-red-900"
                        onClick={() => removeFromCart(item.id)}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        
        <div className="border-t border-gray-200 pt-4">
          <div className="flex justify-between mb-2">
            <span className="text-gray-600">Tổng tiền:</span>
            <span className="font-medium">{new Intl.NumberFormat("vi-VN").format(subtotal)} đ</span>
          </div>
          
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600">Giảm giá:</span>
            <div className="flex items-center">
              <input
                type="number"
                min="0"
                className="w-24 px-3 py-1 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-right"
                value={discount}
                onChange={(e) => setDiscount(parseInt(e.target.value) || 0)}
              />
              <span className="ml-1">đ</span>
            </div>
          </div>
          
          <div className="flex justify-between mb-4 text-lg font-bold">
            <span>Thành tiền:</span>
            <span className="text-blue-600">{new Intl.NumberFormat("vi-VN").format(finalAmount)} đ</span>
          </div>
          
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Phương thức thanh toán
              </label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
              >
                {loaderData.paymentMethods.map((method) => (
                  <option key={method.value} value={method.value}>
                    {method.label}
                  </option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Ghi chú
              </label>
              <input
                type="text"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
          
          <button
            type="button"
            className="w-full py-3 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            onClick={handleCheckout}
            disabled={navigation.state === "submitting" || cart.length === 0}
          >
            {navigation.state === "submitting" ? (
              <span className="flex justify-center items-center">
                <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Đang xử lý...
              </span>
            ) : ('Thanh toán')}
          </button>
        </div>
      </div>
      
      {/* Modal thành công */}
      {showSuccessModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full">
            <div className="flex justify-center mb-4">
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                className="h-16 w-16 text-green-500" 
                viewBox="0 0 20 20" 
                fill="currentColor"
              >
                <path 
                  fillRule="evenodd" 
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" 
                  clipRule="evenodd" 
                />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-center mb-2 text-gray-800">
              Tạo hóa đơn thành công
            </h2>
            <p className="text-center text-gray-600 mb-4">
              Hóa đơn {loaderData.nextInvoiceCode} đã được tạo và lưu trữ.
            </p>
            <div className="flex justify-center">
              <button
                type="button"
                className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                onClick={() => setShowSuccessModal(false)}
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
