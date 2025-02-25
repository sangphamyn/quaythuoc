import { redirect, type ActionFunctionArgs } from "@remix-run/node";
import { Form, Link, useActionData, useNavigation } from "@remix-run/react";
import { useEffect, useRef } from "react";
import { db } from "~/utils/db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const formData = await request.formData();
  const name = formData.get("name")?.toString();
  const description = formData.get("description")?.toString();

  const errors: Record<string, string> = {};

  if (!name || typeof name !== "string") {
    errors.name = "Tên đơn vị là bắt buộc";
  } else if (name.length < 2) {
    errors.name = "Tên đơn vị phải có ít nhất 2 ký tự";
  }

  if (description && typeof description !== "string") {
    errors.description = "Mô tả không hợp lệ";
  }

  // Kiểm tra đơn vị đã tồn tại
  if (name && typeof name === "string") {
    const existingUnit = await db.unit.findFirst({
      where: { name: name },
    });

    if (existingUnit) {
      errors.name = `Đơn vị "${name}" đã tồn tại`;
    }
  }

  if (Object.keys(errors).length > 0) {
    return { errors, values: { name, description } };
  }

  await db.unit.create({
    data: {
      name: name as string,
      description: description ? (description as string) : null,
    },
  });

  return redirect("/admin/units");
};

export default function NewUnit() {
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
        <h1 className="text-2xl font-bold">Thêm đơn vị tính mới</h1>
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
              defaultValue={actionData?.values?.name || ""}
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
              defaultValue={actionData?.values?.description || ""}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-blue-500"
              placeholder="Nhập mô tả về đơn vị (không bắt buộc)"
              rows={3}
            />
            {actionData?.errors?.description && (
              <p className="text-red-500 text-sm mt-1">{actionData.errors.description}</p>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Link
              to="/admin/units"
              className="px-4 py-2 bg-gray-100 text-gray-800 rounded-md hover:bg-gray-200 flex items-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
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
                <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
              </svg>
              <span>{isSubmitting ? "Đang lưu..." : "Lưu đơn vị"}</span>
            </button>
          </div>
        </Form>
      </div>
    </div>
  );
}
