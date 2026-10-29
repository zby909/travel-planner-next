"use client";

export function DeleteFlightButton() {
  return <button className="admin-danger" type="submit" onClick={(event) => {
    if (!window.confirm("确定删除这条机票报价吗？删除后不能恢复。")) event.preventDefault();
  }}>删除本条</button>;
}
