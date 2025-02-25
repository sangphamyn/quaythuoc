import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { Form, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import { useEffect, useRef, useState } from "react";
import { db } from "~/utils/db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Lấy danh sách danh mục và các dữ liệu cần thiết khác
  const [categories, usageRoutes, units, cabinets] = await Promise.all([
    db.category.findMany({
      orderBy: { name: 'asc' }
    }),
    db.usageRoute.findMany({
      orderBy: { name: 'asc' }
    }),
    db.unit.findMany({
      orderBy: { name: 'asc' }
    }),
    db.cabinet.findMany({
      include: {
        rows: {
          include: {
            compartments: true
          }
        }
      },
      orderBy: { name: 'asc' }
    })
  ]);

  return json({
    categories,
    usageRoutes,
    units,
    cabinets
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const formData = await request.formData();

  // Lấy thông tin cơ bản của sản phẩm
  const code = formData.get("code")?.toString().trim();
  const name = formData.get("name")?.toString().trim();
  const categoryId = formData.get("categoryId");
  const usageRouteId = formData.get("usageRouteId");
  const description = formData.get("description")?.toString().trim();
  const compartmentId = formData.get("compartmentId");
  
  // Lấy thông tin đơn vị cơ bản
  const baseUnitId = formData.get("baseUnitId");
  const costPrice = formData.get("costPrice");
  const sellingPrice = formData.get("sellingPrice");
  
  // Xác thực dữ liệu
  const errors: Record<string, string> = {};
  
  if (!code) {
    errors.code = "Mã sản phẩm là bắt buộc";
  } else if (code.length < 2) {
    errors.code = "Mã sản phẩm phải có ít nhất 2 ký tự";
  }
  
  if (!name) {
    errors.name = "Tên sản phẩm là bắt buộc";
  } else if (name.length < 2) {
    errors.name = "Tên sản phẩm phải có ít nhất 2 ký tự";
  }
  
  if (!categoryId) {
    errors.categoryId = "Danh mục sản phẩm là bắt buộc";
  }
  
  if (!baseUnitId) {
    errors.baseUnitId = "Đơn vị cơ bản là bắt buộc";
  }
  
  const costPriceNumber = parseFloat(costPrice?.toString() || "0");
  if (isNaN(costPriceNumber) || costPriceNumber < 0) {
    errors.costPrice = "Giá vốn không hợp lệ";
  }
  
  const sellingPriceNumber = parseFloat(sellingPrice?.toString() || "0");
  if (isNaN(sellingPriceNumber) || sellingPriceNumber < 0) {
    errors.sellingPrice = "Giá bán không hợp lệ";
  }
  
  // Kiểm tra xem mã sản phẩm đã tồn tại chưa
  if (code && !errors.code) {
    const existingProduct = await db.product.findUnique({
      where: { code }
    });
    
    if (existingProduct) {
      errors.code = `Mã sản phẩm '${code}' đã được sử dụng`;
    }
  }
  
  // Nếu có lỗi, trả về lỗi cùng với giá trị đã nhập
  if (Object.keys(errors).length > 0) {
    return json({ 
      errors,
      values: {
        code,
        name,
        categoryId: categoryId ? Number(categoryId) : undefined,
        usageRouteId: usageRouteId ? Number(usageRouteId) : undefined,
        description,
        compartmentId: compartmentId ? Number(compartmentId) : undefined,
        baseUnitId: baseUnitId ? Number(baseUnitId) : undefined,
        costPrice,
        sellingPrice
      }
    });
  }
  
  // Tạo sản phẩm mới với transaction để đảm bảo tính toàn vẹn dữ liệu
  try {
    const result = await db.$transaction(async (tx) => {
      // Tạo sản phẩm
      const newProduct = await tx.product.create({
        data: {
          code: code as string,
          name: name as string,
          categoryId: Number(categoryId),
          usageRouteId: usageRouteId ? Number(usageRouteId) : null,
          description: description || null,
          compartmentId: compartmentId ? Number(compartmentId) : null,
          baseUnitId: Number(baseUnitId),
        }
      });
      
      // Tạo đơn vị tính cơ bản
      await tx.productUnit.create({
        data: {
          productId: newProduct.id,
          unitId: Number(baseUnitId),
          conversionFactor: 1, // Hệ số quy đổi đơn vị cơ bản luôn là 1
          costPrice: costPriceNumber,
          sellingPrice: sellingPriceNumber,
          isBaseUnit: true
        }
      });
      
      return newProduct;
    });
    
    return redirect(`/admin/products/${result.id}`);
  } catch (error) {
    console.error("Error creating product:", error);
    return json({ 
      errors: { _form: "Đã có lỗi xảy ra khi tạo sản phẩm. Vui lòng thử lại." },
      values: {
        code,
        name,
        categoryId: categoryId ? Number(categoryId) : undefined,
        usageRouteId: usageRouteId ? Number(usageRouteId) : undefined,
        description,
        compartmentId: compartmentId ? Number(compartmentId) : undefined,
        baseUnitId: baseUnitId ? Number(baseUnitId) : undefined,
        costPrice,
        sellingPrice
      }
    });
  }
};

export default function NewProduct() {
  const { categories, usageRoutes, units, cabinets } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  
  const codeRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  
  const [selectedCabinetId, setSelectedCabinetId] = useState<number | null>(null);
  const [selectedRowId, setSelectedRowId] = useState<number | null>(null);
  
  // Focus vào trường có lỗi đầu tiên
  useEffect(() => {
    if (actionData?.errors?.code) {
      codeRef.current?.focus();
    } else if (actionData?.errors?.name) {
      nameRef.current?.focus();
    }
  }, [actionData]);
  
  // Lấy danh sách hàng dựa trên tủ được chọn
  const rows = selectedCabinetId 
    ? cabinets.find(cabinet => cabinet.id === selectedCabinetId)?.rows || []
    : [];
    
  // Lấy danh sách ngăn dựa trên hàng được chọn
  const compartments = selectedRowId
    ? rows.find(row => row.id === selectedRowId)?.compartments || []
    : [];
    
  // Xử lý khi thay đổi tủ
  const handleCabinetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const cabinetId = Number(e.target.value) || null;
    setSelectedCabinetId(cabinetId);
    setSelectedRowId(null); // Reset row selection
  };
  
  // Xử lý khi thay đổi hàng
  const handleRowChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const rowId = Number(e.target.value) || null;
    setSelectedRowId(rowId);
  };
  
  return (
    <div className="container mx-auto p-4 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Thêm sản phẩm mới</h1>
      </div>
      
      <Form method="post" className="space-y-6">
        {actionData?.errors?._form && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
            {actionData.errors._form}
          </div>
        )}
        
        {/* Thông tin cơ bản */}
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-lg font-semibold mb-4">Thông tin cơ bản</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Mã sản phẩm */}
            <div>
              <label htmlFor="code" className="block text-sm font-medium text-gray-700 mb-1">
                Mã sản phẩm <span className="text-red-500">*</span>
              </label>
              <input
                ref={codeRef}
                type="text"
                id="code"
                name="code"
                defaultValue={actionData?.values?.code || ""}
                className={`w-full px-3 py-2 border rounded-md ${
                  actionData?.errors?.code
                    ? "border-red-500 focus:outline-red-500"
                    : "border-gray-300 focus:outline-blue-500"
                }`}
                placeholder="Nhập mã sản phẩm"
              />
              {actionData?.errors?.code && (
                <p className="text-red-500 text-sm mt-1">{actionData.errors.code}</p>
              )}
            </div>
            
            {/* Tên sản phẩm */}
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                Tên sản phẩm <span className="text-red-500">*</span>
              </label>
              <input
                ref={nameRef}
                type="text"
                id="name"
                name="name"
                defaultValue={actionData?.values?.name || ""}
                className={`w-full px-3 py-2 border rounded-md ${
                  actionData?.errors?.name
                    ? "border-red-500 focus:outline-red-500"
                    : "border-gray-300 focus:outline-blue-500"
                }`}
                placeholder="Nhập tên sản phẩm"
              />
              {actionData?.errors?.name && (
                <p className="text-red-500 text-sm mt-1">{actionData.errors.name}</p>
              )}
            </div>
            
            {/* Danh mục */}
            <div>
              <label htmlFor="categoryId" className="block text-sm font-medium text-gray-700 mb-1">
                Danh mục <span className="text-red-500">*</span>
              </label>
              <select
                id="categoryId"
                name="categoryId"
                defaultValue={actionData?.values?.categoryId || ""}
                className={`w-full px-3 py-2 border rounded-md appearance-none bg-white ${
                  actionData?.errors?.categoryId
                    ? "border-red-500 focus:outline-red-500"
                    : "border-gray-300 focus:outline-blue-500"
                }`}
              >
                <option value="">-- Chọn danh mục --</option>
                {categories.map(category => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              {actionData?.errors?.categoryId && (
                <p className="text-red-500 text-sm mt-1">{actionData.errors.categoryId}</p>
              )}
            </div>
            
            {/* Đường dùng */}
            <div>
              <label htmlFor="usageRouteId" className="block text-sm font-medium text-gray-700 mb-1">
                Đường dùng
              </label>
              <select
                id="usageRouteId"
                name="usageRouteId"
                defaultValue={actionData?.values?.usageRouteId || ""}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-blue-500 appearance-none bg-white"
              >
                <option value="">-- Chọn đường dùng --</option>
                {usageRoutes.map(route => (
                  <option key={route.id} value={route.id}>
                    {route.name}
                  </option>
                ))}
              </select>
            </div>
            
            {/* Mô tả */}
            <div className="md:col-span-2">
              <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                Mô tả
              </label>
              <textarea
                id="description"
                name="description"
                defaultValue={actionData?.values?.description || ""}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-blue-500"
                placeholder="Nhập mô tả sản phẩm"
                rows={3}
              />
            </div>
          </div>
        </div>
        
        {/* Vị trí lưu trữ */}
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-lg font-semibold mb-4">Vị trí lưu trữ</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Tủ */}
            <div>
              <label htmlFor="cabinetId" className="block text-sm font-medium text-gray-700 mb-1">
                Tủ
              </label>
              <select
                id="cabinetId"
                onChange={handleCabinetChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-blue-500 appearance-none bg-white"
              >
                <option value="">-- Chọn tủ --</option>
                {cabinets.map(cabinet => (
                  <option key={cabinet.id} value={cabinet.id}>
                    {cabinet.name}
                  </option>
                ))}
              </select>
            </div>
            
            {/* Hàng */}
            <div>
              <label htmlFor="rowId" className="block text-sm font-medium text-gray-700 mb-1">
                Hàng
              </label>
              <select
                id="rowId"
                onChange={handleRowChange}
                disabled={!selectedCabinetId}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-blue-500 appearance-none bg-white disabled:bg-gray-100"
              >
                <option value="">-- Chọn hàng --</option>
                {rows.map(row => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </div>
            
            {/* Ngăn */}
            <div>
              <label htmlFor="compartmentId" className="block text-sm font-medium text-gray-700 mb-1">
                Ngăn
              </label>
              <select
                id="compartmentId"
                name="compartmentId"
                disabled={!selectedRowId}
                defaultValue={actionData?.values?.compartmentId || ""}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-blue-500 appearance-none bg-white disabled:bg-gray-100"
              >
                <option value="">-- Chọn ngăn --</option>
                {compartments.map(compartment => (
                  <option key={compartment.id} value={compartment.id}>
                    {compartment.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
        
        {/* Thông tin giá */}
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-lg font-semibold mb-4">Thông tin đơn vị và giá</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Đơn vị cơ bản */}
            <div>
              <label htmlFor="baseUnitId" className="block text-sm font-medium text-gray-700 mb-1">
                Đơn vị cơ bản <span className="text-red-500">*</span>
              </label>
              <select
                id="baseUnitId"
                name="baseUnitId"
                defaultValue={actionData?.values?.baseUnitId || ""}
                className={`w-full px-3 py-2 border rounded-md appearance-none bg-white ${
                  actionData?.errors?.baseUnitId
                    ? "border-red-500 focus:outline-red-500"
                    : "border-gray-300 focus:outline-blue-500"
                }`}
              >
                <option value="">-- Chọn đơn vị --</option>
                {units.map(unit => (
                  <option key={unit.id} value={unit.id}>
                    {unit.name}
                  </option>
                ))}
              </select>
              {actionData?.errors?.baseUnitId && (
                <p className="text-red-500 text-sm mt-1">{actionData.errors.baseUnitId}</p>
              )}
              <p className="text-xs text-gray-500 mt-1">
                Bạn có thể thêm các đơn vị khác sau khi tạo sản phẩm
              </p>
            </div>
            
            {/* Giá vốn */}
            <div>
              <label htmlFor="costPrice" className="block text-sm font-medium text-gray-700 mb-1">
                Giá vốn
              </label>
              <div className="relative">
                <input
                  type="number"
                  id="costPrice"
                  name="costPrice"
                  min="0"
                  step="1000"
                  defaultValue={actionData?.values?.costPrice || "0"}
                  className={`w-full px-3 py-2 border rounded-md pr-9 ${
                    actionData?.errors?.costPrice
                      ? "border-red-500 focus:outline-red-500"
                      : "border-gray-300 focus:outline-blue-500"
                  }`}
                  placeholder="Nhập giá vốn"
                />
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                  <span className="text-gray-500">đ</span>
                </div>
              </div>
              {actionData?.errors?.costPrice && (
                <p className="text-red-500 text-sm mt-1">{actionData.errors.costPrice}</p>
              )}
            </div>
            
            {/* Giá bán */}
            <div>
              <label htmlFor="sellingPrice" className="block text-sm font-medium text-gray-700 mb-1">
                Giá bán
              </label>
              <div className="relative">
                <input
                  type="number"
                  id="sellingPrice"
                  name="sellingPrice"
                  min="0"
                  step="1000"
                  defaultValue={actionData?.values?.sellingPrice || "0"}
                  className={`w-full px-3 py-2 border rounded-md pr-9 ${
                    actionData?.errors?.sellingPrice
                      ? "border-red-500 focus:outline-red-500"
                      : "border-gray-300 focus:outline-blue-500"
                  }`}
                  placeholder="Nhập giá bán"
                />
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                  <span className="text-gray-500">đ</span>
                </div>
              </div>
              {actionData?.errors?.sellingPrice && (
                <p className="text-red-500 text-sm mt-1">{actionData.errors.sellingPrice}</p>
              )}
            </div>
          </div>
        </div>
        
        {/* Nút điều hướng */}
        <div className="flex justify-end gap-2">
          <a
            href="/admin/products"
            className="px-4 py-2 bg-gray-100 text-gray-800 rounded-md hover:bg-gray-200 flex items-center gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
            <span>Hủy</span>
          </a>
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
            <span>{isSubmitting ? "Đang lưu..." : "Tạo sản phẩm"}</span>
          </button>
        </div>
      </Form>
    </div>
  );
}
