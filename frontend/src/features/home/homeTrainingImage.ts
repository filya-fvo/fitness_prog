/** The unselected profile uses the default male workout artwork. */
export function homeTrainingImage(sex: string): string {
  return sex === "female"
    ? "/app-media/home-training-female.webp"
    : "/app-media/home-training-male.webp";
}
