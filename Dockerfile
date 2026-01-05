# Use Node 20 as the base image
FROM node:20-slim

# Set the working directory
WORKDIR /usr/src/app

# Copy package files first for better caching
COPY package*.json ./

# Install dependencies 
# (using 'npm ci' is preferred for production/automated builds)
RUN npm install

# Copy the rest of your application code
COPY . .

# Set environment variables
ENV NODE_ENV=production
ENV PORT=8080

# Expose the port defined in fly.toml
EXPOSE 8080

# Use the non-root node user for security
# Ensure the app directory is owned by the node user
RUN chown -R node:node /usr/src/app
USER node

# Start the application
CMD [ "node", "index.js" ]