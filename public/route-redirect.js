const route = window.location.pathname.split("/").filter(Boolean).pop() || "now";
window.location.replace(
  `/landjuweel/#/${route}${window.location.search}${window.location.hash}`,
);
