import { webBackground } from './background.js';

export function selectBackgroundImage() {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/png,image/jpeg,image/webp,image/gif,image/bmp';
    input.hidden = true;
    const finish = (callback, value) => { input.remove(); callback(value); };
    input.addEventListener('cancel', () => finish(resolve, null), { once: true });
    input.addEventListener('change', async () => {
      try {
        const file = input.files?.[0];
        finish(resolve, file ? (await webBackground.setImage(file)).backgroundImageUrl : null);
      } catch (error) { finish(reject, error); }
    }, { once: true });
    document.body.append(input); input.click();
  });
}
