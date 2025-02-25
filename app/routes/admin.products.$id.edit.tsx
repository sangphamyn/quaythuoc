import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { Form, Link, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import { useEffect, useRef, useState } from "react";
import { db } from "~/utils/db.server";

export const loader = async ({ params }: LoaderFunctionArgs) => {
  const productId = params.id;
  
  if (!productId || isNaN(Number(productId))) {
    return redirect("/admin/products");
  }
  
  // Lấy thông tin sản phẩm hiện tại và các dữ liệu liên quan
  const [product, categories, usageRoutes, units, cabinets] = await Promise.all([
    db.product.findUnique({
      where: { id: Number(productId) },
      include: {
        category: true,
        usageRoute: true,
        compartment: {
          include: {
            row: {
              include: {
                cabinet: true
              }
            }
          }
        },
        productUnits: {
          include: {
            unit: true
          }
        }
      }
    }),
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
  
  if (!product) {
    throw new Response("Không tìm thấy sản phẩm", { status: 404 });
  }
  
  // Lấy thông tin đơn vị cơ bản
  const baseUnit = product.productUnits.find(pu => pu.isBaseUnit);
  
  return json({
    product,
    baseUnit,
    categories,
    usageRoutes,
    units,
    cabinets
  });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const productId = params.id;
  
  if (!productId || isNaN(Number(productId))) {
    return redirect("/admin/products");
  }
  
  const formData = await request.formData();
  
  // Lấy thông tin cơ bản của sản phẩm
  const code = formData.get("code")?.toString().trim();
  const name = formData.get("name")?.toString().trim();
  const categoryId = formData.get("categoryId");
  const usageRouteId = formData.get("usageRouteId");
  const description = formData.get("description")?.toString().trim();
  const compartmentId = formData.get("compartmentId");
  
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
  
  // Kiểm tra xem mã sản phẩm đã tồn tại chưa (ngoại trừ sản phẩm hiện tại)
  if (code && !errors.code) {
    const existingProduct = await db.product.findFirst({
      where: { 
        code,
        id: { not: Number(productId) }
      }
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
        compartmentId: compartmentId ? Number(compartmentId) : undefined
      }
    });
  }
  
  // Cập nhật sản phẩm
  try {
    await db.product.update({
      where: { id: Number(productId) },
      data: {
        code: code as string,
        name: name as string,
        categoryId: Number(categoryId),
        usageRouteId: usageRouteId ? Number(usageRouteId) : null,
        description: description || null,
        compartmentId: compartmentId ? Number(compartmentId) : null
      }
    });
    
    return redirect(`/admin/products/${productId}`);
  } catch (error) {
    console.error("Error updating product:", error);
    return json({ 
      errors: { _form: "Đã có lỗi xảy ra khi cập nhật sản phẩm. Vui lòng thử lại." },
      values: {
        code,
        name,
        categoryId: categoryId ? Number(categoryId) : undefined,
        usageRouteId: usageRouteId ? Number(usageRouteId) : undefined,
        description,
        compartmentId: compartmentId ? Number(compartmentId) : undefined
      }
    });
  }
};

export default function EditProduct() {
  const { product, baseUnit, categories, usageRoutes, units, cabinets } = 
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  
  const codeRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  
  // Thiết lập trạng thái ban đầu cho tủ và hàng
  const initialCabinetId = product.compartment?.row.cabinet.id || null;
  const initialRowId = product.compartment?.row.id || null;
  
  const [selectedCabinetId, setSelectedCabinetId] = useState<number | null>(initialCabinetId);
  const [selectedRowId, setSelectedRowId] = useState<number | null>(initialRowId);
  
  // Focus vào trường có lỗi đầu tiên
  useEffect(() => {
    if (actionData?.values?.code) {
      codeRef.current?.focus();
    } else if (actionData?.values?.name) {
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
        <h1 className="text-2xl font-bold">Chỉnh sửa sản phẩm</h1>
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
                defaultValue={actionData?.values?.code !== undefined ? actionData.values.code : product.code}
                className={`w-full px-3 py-2 border rounded-md ${
                  actionData?.values?.code
                    ? "border-red-500 focus:outline-red-500"
                    : "border-gray-300 focus:outline-blue-500"
                }`}
                placeholder="Nhập mã sản phẩm"
              />
              {actionData?.values?.code && (
                <p className="text-red-500 text-sm mt-1">{actionData.values.code}</p>
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
                defaultValue={actionData?.values?.name !== undefined ? actionData.values.name : product.name}
                className={`w-full px-3 py-2 border rounded-md ${
                  actionData?.values?.name
                    ? "border-red-500 focus:outline-red-500"
                    : "border-gray-300 focus:outline-blue-500"
                }`}
                placeholder="Nhập tên sản phẩm"
              />
              {actionData?.values?.name && (
                <p className="text-red-500 text-sm mt-1">{actionData.values.name}</p>
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
                defaultValue={actionData?.values?.categoryId !== undefined ? actionData.values.categoryId : product.categoryId}
                className={`w-full px-3 py-2 border rounded-md appearance-none bg-white ${
                  actionData?.values?.categoryId
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
              {actionData?.values?.categoryId && (
                <p className="text-red-500 text-sm mt-1">{actionData.values.categoryId}</p>
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
                defaultValue={actionData?.values?.usageRouteId !== undefined ? actionData.values.usageRouteId : product.usageRouteId || ""}
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
                defaultValue={actionData?.values?.description !== undefined ? actionData.values.description : product.description || ""}
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
                value={selectedCabinetId || ""}
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
                value={selectedRowId || ""}
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
                defaultValue={actionData?.values?.compartmentId !== undefined ? actionData.values.compartmentId : product.compartmentId || ""}
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
        
        {/* Đơn vị tính và giá */}
        <div className="bg-white p-6 rounded-lg shadow-md">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">Đơn vị tính</h2>
            <Link
              to={`/admin/products/${product.id}/units`}
              className="px-3 py-1 bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 text-sm flex items-center gap-1"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
              </svg>
              <span>Quản lý đơn vị</span>
            </Link>
          </div>
          
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr>
                <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Đơn vị
                </th>
                <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Hệ số quy đổi
                </th>
                <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Giá vốn
                </th>
                <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Giá bán
                </th>
                <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Mặc định
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {product.productUnits.map(unit => (
                <tr key={unit.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 whitespace-nowrap text-sm font-medium text-gray-900">
                    {unit.unit.name}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500">
                    {unit.conversionFactor.toFixed(unit.conversionFactor % 1 === 0 ? 0 : 2)}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500">
                    {unit.costPrice.toLocaleString("vi-VN")} đ
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500">
                    {unit.sellingPrice.toLocaleString("vi-VN")} đ
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap text-sm">
                    {unit.isBaseUnit && (
                      <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs">
                        Đơn vị cơ bản
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-gray-500 mt-2">
            Đơn vị cơ bản: {baseUnit?.unit.name || "Chưa thiết lập"}
          </p>
        </div>
        
        {/* Nút điều hướng */}
        <div className="flex justify-end gap-2">
          <a
            href={`/admin/products/${product.id}`}
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
              <path d="M7.707 10.293a1 1 0 10-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 11.586V6a1 1 0 10-2 0v5.586l-1.293-1.293z" />
              <path d="M5 18a2 2 0 01-2-2V6a2 2 0 012-2h4a1 1 0 010 2H5v12h10V6h-4a1 1 0 110-2h4a2 2 0 012 2v10a2 2 0 01-2 2H5z" />
            </svg>
            <span>{isSubmitting ? "Đang lưu..." : "Lưu thay đổi"}</span>
          </button>
        </div>
      </Form>
    </div>
  );
}
