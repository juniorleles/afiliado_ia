import * as React from "react";
import { Button, type ButtonProps } from "./button";

export interface IconButtonProps extends ButtonProps {
  label: string;
}

const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(({ label, type = "button", ...props }, ref) => (
  <Button ref={ref} type={type} {...props} variant="icon" size="icon" aria-label={label} />
));
IconButton.displayName = "IconButton";

export { IconButton };
