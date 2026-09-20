// Keep the old scene visible until the next local image actually decodes.
export async function imageReady(url) {
  url = await url;
  const image = new Image();
  image.src = url;
  await image.decode();
  return url;
}
