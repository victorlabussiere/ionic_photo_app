import { Injectable } from '@angular/core';
import { Camera, CameraResultType, CameraSource, Photo } from '@capacitor/camera'
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Preferences } from '@capacitor/preferences';
import { Platform } from '@ionic/angular';

@Injectable({
  providedIn: 'root'
})

export class PhotoService {
  public photos: UserPhoto[] = [];
  private PHOTO_STORAGE: string = 'photos';
  private platform: Platform;

  constructor(platform: Platform) {
    this.platform = platform
  }

  private async readAsBase64(photo: Photo) {

    if (this.platform.is('hybrid')) {
      // Ler o arquivo em base64
      const file = await Filesystem.readFile({
        path: photo.path!
      })

      return file.data
    } else {
      // buscar foto, ler como blob e converter para base 64
      const response = await fetch(photo.webPath!);
      const blob = await response.blob()

      return await this.convertBlobToBase64(blob) as string;
    }
  }

  private convertBlobToBase64 = (blob: Blob) => new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onerror = rej;
    reader.onload = () => {
      res(reader.result)
    }
    reader.readAsDataURL(blob);
  })

  public async addNewToGallery() {
    const capturedPhoto = await Camera.getPhoto({
      resultType: CameraResultType.Uri,
      source: CameraSource.Camera,
      quality: 100
    })

    const savedImageFile = await this.savePictures(capturedPhoto)
    this.photos.unshift(savedImageFile)

    /**
      @Preferences somente suporta strings
      Portanto, se torna prático utilizar o objeto JSON para interagir
      Definindo um valor com JSON.stringify
      Retornando um valor com JSON.parse
    */
    Preferences.set({
      key: this.PHOTO_STORAGE,
      value: JSON.stringify(this.photos)
    })
  }

  private async savePictures(photo: Photo) {
    // converter a foto para a base64, requerido pelo filesystem API para salvar
    const base64Data = await this.readAsBase64(photo)

    // escrever o arquivo no data directory
    const fileName = new Date().getTime() + '.jpeg';
    const savedFile = await Filesystem.writeFile({
      path: fileName,
      data: base64Data,
      directory: Directory.Data
    })

    if (this.platform.is('hybrid')) {
      // exibir imagem ao reescrever o 'file://' path para HTTP
      return {
        filepath: savedFile.uri,
        webviewPath: Capacitor.convertFileSrc(savedFile.uri)
      }
    } else {
      return {
        filepath: fileName,
        webviewPath: photo.webPath
      }
    }
  }

  public async loadSaved() {
    const { value } = await Preferences.get({ key: this.PHOTO_STORAGE })
    this.photos = (value ? JSON.parse(value) : []) as UserPhoto[]

    // Forma mais fácil de observar se a aplicação está na web:
    if (!this.platform.is('hybrid')) {
      // exibir a foto exibindo na base64
      for (let photo of this.photos) {
        // ler cada foto salva direto do Filesystem
        const readFile = await Filesystem.readFile({
          path: photo.filepath,
          directory: Directory.Data
        })

        // Exibição apenas na plataforma online: Carregar foto na base 64
        photo.webviewPath = `data:image/jpeg;base64${readFile.data}`;
      }
    }
  }

  public async deletePicture(photo: UserPhoto, position: number) {
    // Removendo a foto das referências do Array
    this.photos.splice(position, 1)

    // Atualizando o array de fotos no cache sobreescrevendo o existente.
    Preferences.set({
      key: this.PHOTO_STORAGE,
      value: JSON.stringify(this.photos)
    })

    // Deletando a foto do filesystem 
    const filename = photo.filepath
      .substr(photo.filepath.lastIndexOf('/') + 1)

    await Filesystem.deleteFile({
      path: filename,
      directory: Directory.Data
    })
  }
}

export interface UserPhoto {
  filepath: string,
  webviewPath?: string
}