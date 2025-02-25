import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { Form, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import { useEffect, useRef } from "react";
import { db } from "~/utils/db.server";

export const loader = async ({ params }: LoaderFunctionArgs) => {
  const unitId = params.id;
  
  if (!unitId || isNaN(Number(unitId))) {
    return redirect("/admin/units");
  }
  
  const unit = await db.unit.findUnique({
    where: { id: Number(unitId) }
  });
  
  if (!unit) {
    throw new Response("Không tìm thấy đơn vị", { status: 404 });
  }
  
  return json({ unit });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const unitId = params.id;
  
  if (!unitId || isNaN(Number(unitId))) {
    return redirect("/admin/units");
  }
  
  const formData = await request.formData();
  const name = formData.get("name");
  const description = formData.get("description");

  const errors: Record<string, string> = {};

  if (!name || typeof name !== "string") {
    errors.name = "Tên đơn vị là bắt buộc";
  } else if (name.length < 2) {
    errors.name = "Tên đơn vị phải có ít nhất 2 ký tự";
  }

  if (description && typeof description !== "string") {
    errors.description = "Mô tả không hợp lệ";
  }

  // Kiểm tra đơn vị đã tồn tại (trừ đơn vị hiện tại)
  if (name && typeof name === "string") {
    const existingUnit = await db.unit.findFirst({
      where: { 
        name: name,
        id: { not: Number(unitId) }
      },
    });

    if (existingUnit) {
      errors.name = `Đơn vị "${name}" đã tồn tại`;
    }
  }

  if (Object.keys(errors).length > 0) {
    return { errors, values: { name, description } };
  }

  await db.unit.update({
    where: { id: Number(unitId) },
    data: {
      name: name as string,
      description: description ? (description as string) : null,
    },
  });

  return redirect(`/admin/units/${unitId}`);
};

export default function EditUnit() {
  const { unit } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const nameRef = useRef<HTMLInputElement>(null);
  const isSubmitting = navigation.state === "submitting";

  useEffect(() => {
    if (actionData?.errors?.name) {
      nameRef.current?.focus();
    }
  }, [actionData]);

  return (
    <div className="container mx-auto p-4 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Chỉnh sửa đơn vị tính</h1>
      </div>

      <div className="bg-white p-6 rounded-md shadow-md">
        <Form method="post">
          <div className="mb-4">
            <label 
              htmlFor="name" 
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Tên đơn vị <span className="text-red-500">*</span>
            </label>
            <input
              ref={nameRef}
              type="text"
              id="name"
              name="name"
              defaultValue={actionData?.values?.name !== undefined ? String(actionData.values.name) : String(unit.name)}
              className={`w-full px-3 py-2 border rounded-md ${
                actionData?.errors?.name
                  ? "border-red-500 focus:outline-red-500"
                  : "border-gray-300 focus:outline-blue-500"
              }`}
              placeholder="Nhập tên đơn vị"
            />
            {actionData?.errors?.name && (
              <p className="text-red-500 text-sm mt-1">{actionData.errors.name}</p>
            )}
          </div>

          <div className="mb-6">
            <label 
              htmlFor="description" 
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Mô tả
            </label>
            <textarea
              id="description"
              name="description"
              defaultValue={actionData?.values?.description !== undefined ? String(actionData.values.description) : unit.description ?? ""}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-blue-500"
              placeholder="Nhập mô tả về đơn vị (không bắt buộc)"
              rows={3}
            />
            {actionData?.errors?.description && (
              <p className="text-red-500 text-sm mt-1">{actionData.errors.description}</p>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <a
              href={`/admin/units/${unit.id}`}
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
      
      {/* Product units section */}
      <div className="mt-8">
        <h2 className="text-xl font-semibold mb-4">Thông tin sử dụng</h2>
        <div className="bg-white p-6 rounded-md shadow-md">
          <p className="text-gray-700 mb-4">
            <span className="font-medium">Lưu ý:</span> Khi chỉnh sửa đơn vị, các thay đổi sẽ ảnh hưởng đến tất cả các sản phẩm sử dụng đơn vị này.
          </p>
          
          <div className="flex items-center bg-blue-50 p-4 rounded-md text-blue-700 border border-blue-200">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p>Bạn có thể xem danh sách sản phẩm sử dụng đơn vị này trong trang Chi tiết đơn vị.</p>
          </div>
        </div>
      </div>
      
      {/* Usage history list */}
      <div className="mt-8">
        <h2 className="text-xl font-semibold mb-4">Lịch sử chỉnh sửa</h2>
        <div className="bg-white p-6 rounded-md shadow-md">
          <div className="border-l-2 border-gray-200 pl-4 ml-3">
            <div className="mb-4 relative">
              <div className="absolute -left-5 mt-1 rounded-full bg-blue-500 w-6 h-6 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-white" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                </svg>
              </div>
              <div className="ml-4">
                <p className="text-sm text-gray-500">
                  {new Date(unit.updatedAt).toLocaleDateString("vi-VN", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit"
                  })}
                </p>
                <p className="font-medium">Cập nhật gần đây nhất</p>
              </div>
            </div>
            <div className="relative">
              <div className="absolute -left-5 mt-1 rounded-full bg-green-500 w-6 h-6 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-white" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-4">
                <p className="text-sm text-gray-500">
                  {new Date(unit.createdAt).toLocaleDateString("vi-VN", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit"
                  })}
                </p>
                <p className="font-medium">Tạo đơn vị</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
