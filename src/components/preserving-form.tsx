"use client";

import { startTransition, type FormHTMLAttributes } from "react";

type PreservingFormProps = Omit<FormHTMLAttributes<HTMLFormElement>, "action"> & {
  action: (payload: FormData) => void;
};

// 在 React 19 中通过 transition 提交表单，避免服务端校验失败后自动重置用户已填写的输入。
export function PreservingForm({ action, onSubmit, ...props }: PreservingFormProps) {
  return (
    <form
      {...props}
      onSubmit={event => {
        onSubmit?.(event);
        if (event.defaultPrevented) return;
        event.preventDefault();
        const submitter = (event.nativeEvent as SubmitEvent).submitter;
        const formData = submitter instanceof HTMLButtonElement || submitter instanceof HTMLInputElement
          ? new FormData(event.currentTarget, submitter)
          : new FormData(event.currentTarget);
        startTransition(() => action(formData));
      }}
    />
  );
}
