FROM node:17
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install

# Optional for FFmpeg
RUN apt update
RUN apt install ffmpeg -y
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
RUN chmod a+rx /usr/local/bin/yt-dlp

COPY . .
CMD ["node","."]
