import { redirect, type ActionFunctionArgs } from "@remix-run/node";
import { Form, useActionData, useNavigation } from "@remix-run/react";
import { useEffect, useRef } from "react";
import { db } from "~/utils/db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const formData = await request.formData();
  const name = formData.get("name")?.toString().trim();
  const contactPerson = formData.get("contactPerson")?.toString().trim();
  const phone = formData.get("phone")?.toString().trim();
  const email = formData.get("email")?.toString().trim();
  const address = formData.get("address")?.toString().trim();
  const notes = formData.get("notes")?.toString().trim();

  const errors: Record<string, string> = {};

  if (!name) {
    errors.name = "Tên nhà cung cấp là bắt buộc";
  } else if (name.length < 2) {
    errors.name = "Tên nhà cung cấp phải có ít nhất 2 ký tự";
  }

  // Kiểm tra định dạng email nếu có nhập
  if (email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      errors.email = "Email không hợp lệ";
    }
  }

  // Kiểm tra định dạng số điện thoại nếu có nhập
  if (phone) {
    const phoneRegex = /^[0-9+\-()\s]{8,15}$/;
    if (!phoneRegex.test(phone)) {
      errors.phone = "Số điện thoại không hợp lệ";
    }
  }

  if (Object.keys(errors).length > 0) {
    return { errors, values: { name, contactPerson, phone, email, address, notes } };
  }

  await db.supplier.create({
    data: {
      name: name as string,
      contactPerson: contactPerson || null,
      phone: phone || null,
      email: email || null,
      address: address || null,
      notes: notes || null,
    },
  });

  return redirect("/admin/suppliers");
};

export default function AdminSupplierNew() {
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
        <h1 className="text-2xl font-bold">Thêm nhà cung cấp mới</h1>
      </div>

      <div className="bg-white p-6 rounded-md shadow-md">
        <Form method="post">
          <div className="mb-4">
            <label 
              htmlFor="name" 
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Tên nhà cung cấp <span className="text-red-500">*</span>
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
              placeholder="Nhập tên nhà cung cấp"
            />
            {actionData?.errors?.name && (
              <p className="text-red-500 text-sm mt-1">{actionData.errors.name}</p>
            )}
          </div>

          <div className="mb-4">
            <label 
              htmlFor="contactPerson" 
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Người liên hệ
            </label>
            <input
              type="text"
              id="contactPerson"
              name="contactPerson"
              defaultValue={actionData?.values?.contactPerson || ""}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-blue-500"
              placeholder="Nhập tên người liên hệ"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label 
                htmlFor="phone" 
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Số điện thoại
              </label>
              <input
                type="text"
                id="phone"
                name="phone"
                defaultValue={actionData?.values?.phone || ""}
                className={`w-full px-3 py-2 border rounded-md ${
                  actionData?.errors?.phone
                    ? "border-red-500 focus:outline-red-500"
                    : "border-gray-300 focus:outline-blue-500"
                }`}
                placeholder="Nhập số điện thoại"
              />
              {actionData?.errors?.phone && (
                <p className="text-red-500 text-sm mt-1">{actionData.errors.phone}</p>
              )}
            </div>

            <div>
              <label 
                htmlFor="email" 
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Email
              </label>
              <input
                type="email"
                id="email"
                name="email"
                defaultValue={actionData?.values?.email || ""}
                className={`w-full px-3 py-2 border rounded-md ${
                  actionData?.errors?.email
                    ? "border-red-500 focus:outline-red-500"
                    : "border-gray-300 focus:outline-blue-500"
                }`}
                placeholder="Nhập email"
              />
              {actionData?.errors?.email && (
                <p className="text-red-500 text-sm mt-1">{actionData.errors.email}</p>
              )}
            </div>
          </div>

          <div className="mb-4">
            <label 
              htmlFor="address" 
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Địa chỉ
            </label>
            <input
              type="text"
              id="address"
              name="address"
              defaultValue={actionData?.values?.address || ""}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-blue-500"
              placeholder="Nhập địa chỉ"
            />
          </div>

          <div className="mb-6">
            <label 
              htmlFor="notes" 
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Ghi chú
            </label>
            <textarea
              id="notes"
              name="notes"
              defaultValue={actionData?.values?.notes || ""}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-blue-500"
              placeholder="Nhập ghi chú về nhà cung cấp"
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-2">
            <a
              href="/admin/suppliers"
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
              <span>{isSubmitting ? "Đang lưu..." : "Lưu nhà cung cấp"}</span>
            </button>
          </div>
        </Form>
      </div>
    </div>
  );
}
